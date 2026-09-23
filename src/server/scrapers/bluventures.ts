import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.bluventureinvestors.com";
const TOKENS_URL = `${BASE_URL}/_api/v1/access-tokens`;
const QUERY_URL = `${BASE_URL}/_api/cloud-data/v2/items/query`;

// wix. the site builds a page per company from two cms collections — the core
// fund's companies and the cyber fund's — and it used to be read page by page,
// a hundred-odd heavy pages that cloudflare began refusing with 429s in
// september 2026. the collections themselves answer the site's own data api
// with a visitor token, a query apiece, and carry everything the pages
// showed: the name, where the company is, the year it was founded, the year
// blu first invested, and its site. the two collections spell their fields
// differently.
const COLLECTIONS = [
  { id: "COMPANIES", name: "title", founded: "founded", website: "newField1" },
  { id: "Cyber", name: "companyName", founded: "yearFounded", website: "websiteUrl" },
];

type Item = { data?: Record<string, unknown> };

const clean = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

// one address was saved as it was clicked on in an advert, tracking and all
const website = (raw: string) => {
  const [address, query] = raw.split("?");
  if (!query) return raw;
  const kept = query
    .split("&")
    .filter((param) => !/^(gclid|gbraid|wbraid|fbclid|msclkid|gad_[a-z_]*|utm_[a-z]*)=/i.test(param));
  return kept.length > 0 ? `${address}?${kept.join("&")}` : address;
};

async function query(instance: string, collection: string): Promise<Item[]> {
  const resp = await fetch(QUERY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: instance },
    body: JSON.stringify({ dataCollectionId: collection, query: { paging: { limit: 1000 } } }),
  });
  if (!resp.ok) {
    throw new Error(`blu ventures: the ${collection} collection answered ${resp.status}`);
  }
  const { dataItems } = (await resp.json()) as { dataItems?: Item[] };
  return dataItems ?? [];
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const tokens = await fetch(TOKENS_URL);
  if (!tokens.ok) {
    throw new Error(`Failed to fetch ${TOKENS_URL}: ${tokens.status}`);
  }
  const { apps } = (await tokens.json()) as { apps?: Record<string, { instance?: string }> };
  const instance = Object.values(apps ?? {})[0]?.instance;
  if (!instance) {
    throw new Error("blu ventures: no visitor token to query the cms with");
  }

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  for (const collection of COLLECTIONS) {
    const items = await query(instance, collection.id);
    if (items.length === 0) {
      throw new Error(`blu ventures: the ${collection.id} collection came back empty`);
    }
    for (const { data = {} } of items) {
      // the cms keeps a few blank rows the site never shows
      const name = clean(data[collection.name]);
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      const founded = clean(data[collection.founded]);
      const invested = clean(data.firstInvestment);
      companies.push({
        name,
        category: [
          clean(data.location),
          founded ? `Founded ${founded}` : "",
          invested ? `Invested ${invested}` : "",
        ]
          .filter(Boolean)
          .join(", "),
        url: website(clean(data[collection.website])),
      });
    }
  }

  return companies;
}
