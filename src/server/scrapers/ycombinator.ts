import type { ScrapedCompany } from './types';

// the startup directory is served by Algolia; these are the site's public
// search-only credentials, restricted to the public company index
const APP_ID = "45BWZJ1SGC";
const API_KEY =
  "NzllNTY5MzJiZGM2OTY2ZTQwMDEzOTNhYWZiZGRjODlhYzVkNjBmOGRjNzJiMWM4ZTU0ZDlhYTZjOTJiMjlhMWFuYWx5dGljc1RhZ3M9eWNkYyZyZXN0cmljdEluZGljZXM9WUNDb21wYW55X3Byb2R1Y3Rpb24lMkNZQ0NvbXBhbnlfQnlfTGF1bmNoX0RhdGVfcHJvZHVjdGlvbiZ0YWdGaWx0ZXJzPSU1QiUyMnljZGNfcHVibGljJTIyJTVE";
const QUERY_URL = `https://${APP_ID.toLowerCase()}-dsn.algolia.net/1/indexes/*/queries`;
const INDEX = "YCCompany_production";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BATCH_DELAY_MS = 150;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Hit {
  name?: string;
  website?: string;
  industry?: string;
  subindustry?: string;
  batch?: string;
  status?: string;
  objectID?: string;
}

interface Result {
  hits?: Hit[];
  facets?: { batch?: Record<string, number> };
  nbHits?: number;
  message?: string;
}

async function query(params: string): Promise<Result> {
  const resp = await fetch(QUERY_URL, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/json",
      "x-algolia-application-id": APP_ID,
      "x-algolia-api-key": API_KEY,
    },
    body: JSON.stringify({ requests: [{ indexName: INDEX, params }] }),
  });
  if (!resp.ok) {
    throw new Error(
      `Failed to query the YC directory: ${resp.status}` +
        (resp.status === 403 ? " (the site's public search key may have been rotated)" : ""),
    );
  }
  const data: { results?: Result[] } = await resp.json();
  return data.results?.[0] ?? {};
}

export async function scrape(): Promise<ScrapedCompany[]> {
  // Algolia refuses to page beyond 1000 hits, so walk the directory one batch
  // at a time — the largest YC batch is a few hundred companies
  const facets = await query(
    `query=&hitsPerPage=0&facets=${encodeURIComponent('["batch"]')}&maxValuesPerFacet=1000`,
  );
  const batches = Object.keys(facets.facets?.batch ?? {});
  if (batches.length === 0) {
    throw new Error("YC directory returned no batches");
  }
  const total = facets.nbHits ?? 0;

  const byId = new Map<string, ScrapedCompany>();
  for (const batch of batches) {
    const filter = encodeURIComponent(JSON.stringify([[`batch:${batch}`]]));
    const result = await query(`query=&hitsPerPage=1000&page=0&facetFilters=${filter}`);
    for (const hit of result.hits ?? []) {
      if (!hit.name || !hit.objectID) continue;
      // subindustry repeats its parent ("Healthcare -> Medical Devices")
      const subindustry = hit.subindustry?.split("->").pop()?.trim() ?? "";
      byId.set(hit.objectID, {
        name: hit.name.trim(),
        // "Active" is the default state; the rest (Acquired, Public, Inactive)
        // is worth recording alongside the industry and batch
        category: [
          hit.industry,
          subindustry && subindustry !== hit.industry ? subindustry : "",
          hit.batch,
          hit.status && hit.status !== "Active" ? hit.status : "",
        ]
          .filter(Boolean)
          .join(", "),
        url: hit.website ?? "",
      });
    }
    await sleep(BATCH_DELAY_MS);
  }

  // fail loudly rather than importing a partial directory, which would make the
  // missing companies reappear as newcomers on a later run
  if (total > 0 && byId.size < total * 0.95) {
    throw new Error(`YC directory incomplete: got ${byId.size} of ${total} companies`);
  }

  return [...byId.values()];
}
