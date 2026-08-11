import type { ScrapedCompany } from './types';

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// The portfolio list is rendered client-side from an Algolia index (gc_primary).
// Credentials are public, embedded in the site's search bundle.
const ALGOLIA_APP_ID = "ID4635ZLKJ";
const ALGOLIA_SEARCH_API_KEY = "871677f0423646c1278b67120f5adcc0";
const ALGOLIA_INDEX = "gc_primary";

// Step 2: Fetch the Industry from each company detail page (in batches)
async function fetchIndustry(companyUrl: string): Promise<string> {
  if (!companyUrl) return "";
  try {
    const resp = await fetch(companyUrl, { headers: { "User-Agent": UA } });
    if (!resp.ok) return "";
    const html = await resp.text();
    // <strong>Industry:</strong></div><div>VALUE</div>
    const m = html.match(/Industry:<\/strong><\/div>\s*<div[^>]*>([^<]+)</);
    return m ? m[1].trim() : "";
  } catch {
    return "";
  }
}

const BATCH_SIZE = 10;

export async function scrape(): Promise<ScrapedCompany[]> {
  // Step 1: Pull every portfolio company from Algolia (type:Portfolio)
  const algoliaResp = await fetch(
    `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`,
    {
      method: "POST",
      headers: {
        "X-Algolia-Application-Id": ALGOLIA_APP_ID,
        "X-Algolia-API-Key": ALGOLIA_SEARCH_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "",
        hitsPerPage: 1000,
        filters: "type:Portfolio",
        attributesToRetrieve: ["name", "slug"],
      }),
    },
  );
  if (!algoliaResp.ok) {
    throw new Error(`Algolia query failed: ${algoliaResp.status}`);
  }
  const { hits } = (await algoliaResp.json()) as {
    hits: { name: string; slug: string }[];
  };

  const entries: { name: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    const name = (hit.name || "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const url = hit.slug
      ? `https://www.generalcatalyst.com/${hit.slug.replace(/^\//, "")}`
      : "";
    entries.push({ name, url });
  }

  const companies: ScrapedCompany[] = [];
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const industries = await Promise.all(batch.map((e) => fetchIndustry(e.url)));
    for (let j = 0; j < batch.length; j++) {
      companies.push({
        name: batch[j].name,
        category: industries[j],
        url: batch[j].url,
      });
    }
  }

  return companies;
}
