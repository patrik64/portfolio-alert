import type { ScrapedCompany } from './types';

const VAULT_URL = "https://vault.alchemistaccelerator.com";
// the portfolio page draws its grid from the vault, a company at a time filed
// under the class that went through the accelerator together
const LIST_URL =
  `${VAULT_URL}/api/v1/alchemist_companies?include=aclass,tags&filter[aclass.class_type:eq]=alchemist`;
const PAGE_SIZE = 112;
const MAX_PAGES = 40;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// the status of a company alchemist is out of
const EXITS = new Set(["acquired"]);

interface Resource {
  id: number | string;
  type: string;
  attributes?: { name?: string; text?: string; number?: number | string };
  meta?: {
    slug?: string | null;
    status?: string | null;
    location_formatted_address?: string | null;
    aclass_id?: number | string | null;
  };
  relationships?: { tags?: { data?: { id: number | string }[] } };
}

interface Payload {
  data?: Resource[];
  included?: Resource[];
  meta?: { results?: { available?: number } };
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

// the grid shows where a company is by the last step of its address, stepping
// back one when that turns out to be a postcode
const countryOf = (address: string) => {
  const parts = clean(address).split(", ");
  const last = parts[parts.length - 1] ?? "";
  return (last.startsWith("0") ? (parts[parts.length - 2] ?? "") : last).trim();
};

async function fetchPage(page: number) {
  const url = `${LIST_URL}&page[size]=${PAGE_SIZE}&page[number]=${page}`;
  const resp = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch alchemist page ${page}: ${resp.status}`);
  }
  return (await resp.json()) as Payload;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const first = await fetchPage(1);
  const available = Number(first.meta?.results?.available ?? 0);
  if (!first.data?.length) {
    throw new Error("alchemist: the vault returned no companies");
  }

  const pages: Payload[] = [first];
  for (let page = 2; page <= MAX_PAGES; page++) {
    const seen = pages.reduce((total, p) => total + (p.data?.length ?? 0), 0);
    if (available > 0 ? seen >= available : (pages[pages.length - 1].data?.length ?? 0) < PAGE_SIZE) {
      break;
    }
    const next = await fetchPage(page);
    if (!next.data?.length) break;
    pages.push(next);
  }

  // the tags a company is filed under, and the class it went through, are sent
  // alongside the companies rather than inside them
  const labels = new Map<string, string>();
  for (const page of pages) {
    for (const resource of page.included ?? []) {
      if (resource.type === "tags" && resource.attributes?.text) {
        labels.set(`tag:${resource.id}`, clean(resource.attributes.text));
      }
      if (resource.type === "alchemist_classes" && resource.attributes?.number != null) {
        labels.set(`class:${resource.id}`, String(resource.attributes.number));
      }
    }
  }

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    for (const record of page.data ?? []) {
      const name = clean(record.attributes?.name ?? "");
      if (!name || seen.has(name)) continue;
      seen.add(name);

      const status = clean(record.meta?.status ?? "");
      const classNumber = labels.get(`class:${record.meta?.aclass_id}`) ?? "";
      const slug = clean(record.meta?.slug ?? "");

      companies.push({
        name,
        category: [
          ...(record.relationships?.tags?.data ?? []).map((tag) => labels.get(`tag:${tag.id}`) ?? ""),
          countryOf(record.meta?.location_formatted_address ?? ""),
          classNumber ? `Class ${classNumber}` : "",
          // "Active" is a company still going
          status === "Active" ? "" : status,
          EXITS.has(status.toLowerCase()) ? "Exited" : "",
        ]
          .filter(Boolean)
          .join(", "),
        // alchemist keeps company websites behind the vault's login, so this is
        // the profile it publishes for each of them
        url: slug ? `${VAULT_URL}/companies/public/${slug}` : "",
      });
    }
  }

  if (available > 0 && companies.length < available * 0.95) {
    throw new Error(`alchemist: read ${companies.length} of the ${available} companies listed`);
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("alchemist: the companies' tags and classes moved");
  }

  return companies;
}
