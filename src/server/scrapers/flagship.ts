import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.flagshippioneering.com";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
// the site answers a company's page in a few seconds, and ten asked at once
// in ten to fifteen each — more at once only makes each slower — so the
// hundred take a minute and a half or more, and on a slow night ran past
// the four minutes the fetch allows. ten are asked at a time, each given
// most of a minute, and none is begun past the deadline: a company whose
// page was not reached links its page on the fund's site instead
const IN_FLIGHT = 10;
const PAGE_TIMEOUT_MS = 45_000;
const DEADLINE_MS = 150_000;

const STATUSES = ["current", "former"] as const;
const DOMAINS: [string, string][] = [
  ["human-health", "Human Health"],
  ["sustainability", "Sustainability"],
];

function parseGrid(html: string): { name: string; path: string }[] {
  return [
    ...html.matchAll(
      /<a href="(https:\/\/www\.flagshippioneering\.com\/companies\/[^"]+)" class="companies__grid-link" title="([^"]+)"/g,
    ),
  ].map((m) => ({ path: m[1], name: m[2].replace(/&amp;/g, "&").trim() }));
}

async function fetchList(params: string): Promise<{ name: string; path: string }[]> {
  const url = `${BASE_URL}/companies?${params}`;
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return parseGrid(await resp.text());
}

// each company's detail page links the company website from its logo
async function fetchWebsite(path: string): Promise<string> {
  try {
    const resp = await fetch(path, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });
    if (!resp.ok) return "";
    const html = await resp.text();
    return html.match(/<a href="(https?:\/\/[^"]+)"[^>]*class="company__logo-link"/)?.[1] ?? "";
  } catch {
    return "";
  }
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const started = Date.now();
  interface Entry {
    name: string;
    path: string;
    domains: string[];
    historical: boolean;
  }
  const byPath = new Map<string, Entry>();

  // the grid shows current companies by default; former ones live behind the
  // status filter, and the domain filters supply each company's domain
  for (const status of STATUSES) {
    for (const entry of await fetchList(`status=${status}`)) {
      byPath.set(entry.path, { ...entry, domains: [], historical: status === "former" });
    }
    for (const [slug, label] of DOMAINS) {
      for (const entry of await fetchList(`status=${status}&domain=${slug}`)) {
        const existing = byPath.get(entry.path);
        if (existing && !existing.domains.includes(label)) existing.domains.push(label);
      }
    }
  }

  const entries = [...byPath.values()];

  // the pages are asked for as fast as they answer, a new one begun as each
  // comes back, rather than in batches that wait for their slowest
  const websiteByPath = new Map<string, string>();
  let next = 0;
  const ask = async () => {
    while (next < entries.length && Date.now() - started < DEADLINE_MS) {
      const e = entries[next++];
      websiteByPath.set(e.path, await fetchWebsite(e.path));
    }
  };
  await Promise.all(Array.from({ length: IN_FLIGHT }, ask));

  const companies: ScrapedCompany[] = entries.map((e) => ({
    name: e.name,
    category: [...e.domains, ...(e.historical ? ["Historical"] : [])].join(", "),
    url: websiteByPath.get(e.path) || e.path,
  }));

  return companies;
}
