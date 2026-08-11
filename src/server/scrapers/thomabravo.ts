import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.thomabravo.com";
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 250;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// the site is a Next.js app; its data arrives as escaped chunks of the RSC
// flight payload, which reassemble into one JSON-ish string
function flightPayload(html: string): string {
  return [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)]
    .map((m) => {
      try {
        return JSON.parse(m[1]) as string;
      } catch {
        return "";
      }
    })
    .join("");
}

// each company's detail page lists its website under "links"
async function fetchWebsite(slug: string, attempt = 1): Promise<string> {
  try {
    const resp = await fetch(`${PAGE_URL}/${slug}`, { headers: { "User-Agent": UA } });
    if (!resp.ok) throw new Error(`${resp.status}`);
    const payload = flightPayload(await resp.text());
    return payload.match(/"links":\[\{"id":"[^"]*","url":"(https?:\/\/[^"]+)"/)?.[1] ?? "";
  } catch {
    if (attempt < 3) {
      await sleep(1000 * attempt);
      return fetchWebsite(slug, attempt + 1);
    }
    return "";
  }
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const payload = flightPayload(await resp.text());

  // the filter definitions carry the display label for every sector slug
  const labels = new Map<string, string>();
  for (const m of payload.matchAll(/\{"label":"([^"]+)","value":"([^"]+)"\}/g)) {
    if (!labels.has(m[2])) labels.set(m[2], m[1]);
  }

  interface Entry {
    name: string;
    slug: string;
    sectors: string[];
    prior: boolean;
  }
  const entries: Entry[] = [];
  const seen = new Set<string>();

  for (const m of payload.matchAll(
    /\{"id":\d+,"name":"([^"]+)","slug":"([^"]+)",[\s\S]*?"status":\[([^\]]*)\],"sectors":\[([^\]]*)\],"locations":\[[^\]]*\],"platforms":\[[^\]]*\],"searchableNormalized"/g,
  )) {
    const slug = m[2];
    if (seen.has(slug)) continue;
    seen.add(slug);
    entries.push({
      name: m[1],
      slug,
      sectors: [...m[4].matchAll(/"([^"]+)"/g)].map((s) => s[1]),
      prior: m[3].includes('"prior"'),
    });
  }

  const websiteBySlug = new Map<string, string>();
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (e) => ({ slug: e.slug, website: await fetchWebsite(e.slug) })),
    );
    for (const r of results) {
      websiteBySlug.set(r.slug, r.website);
    }
    await sleep(BATCH_DELAY_MS);
  }

  const companies: ScrapedCompany[] = entries.map((e) => ({
    name: e.name,
    // "current" is the default state; only prior investments are worth noting
    category: [...e.sectors.map((s) => labels.get(s) ?? s), e.prior ? "Prior" : ""]
      .filter(Boolean)
      .join(", "),
    url: websiteBySlug.get(e.slug) || `${PAGE_URL}/${e.slug}`,
  }));

  return companies;
}
