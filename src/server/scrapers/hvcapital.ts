import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.hvcapital.com";
// the portfolio table server-renders only its first rows and loads the rest
// through a build-specific server action, so walk the sitemap instead
const SITEMAP_URL = `${BASE_URL}/sitemap.xml`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BATCH_SIZE = 8;
const BATCH_DELAY_MS = 300;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const decode = (s: string) =>
  s
    .replace(/\\u0026|&amp;/g, "&")
    .replace(/&#039;|&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();

interface Detail {
  name: string;
  tags: string[];
  hq: string;
}

// each company page carries its stage and sector as hero tags, plus HQ
async function fetchDetail(url: string, attempt = 1): Promise<Detail> {
  try {
    const resp = await fetch(url, { headers: { "User-Agent": UA } });
    if (!resp.ok) throw new Error(`${resp.status}`);
    const html = await resp.text();

    const name = decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "").split("|")[0].trim();
    // the featured companies have a full case page whose hero lists the stage
    // and sectors; the rest are stubs that fill in client-side
    const tagBlock = html.match(/CaseHero_tags[\s\S]{0,800}?\]\]/)?.[0] ?? "";
    const tags = [...tagBlock.matchAll(/\\?"li\\?",\\?"([^"\\]+)/g)]
      .map((m) => decode(m[1].replace(/\\u0026/g, "&")))
      .filter((t, i, all) => t && all.indexOf(t) === i);
    const hq = decode(
      html.match(/<dt>HQ<\/dt><dd[^>]*><span>([^<]*)<\/span>/)?.[1] ?? "",
    );

    return { name, tags, hq };
  } catch {
    if (attempt < 3) {
      await sleep(1000 * attempt);
      return fetchDetail(url, attempt + 1);
    }
    return { name: "", tags: [], hq: "" };
  }
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(SITEMAP_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${SITEMAP_URL}: ${resp.status}`);
  }
  const xml = await resp.text();

  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1])
    .filter((u) => /\/portfolio\/[^/]+\/?$/.test(u))
    .map((u) => u.replace("https://hvcapital.com", BASE_URL));
  if (urls.length === 0) {
    throw new Error("hv capital: the sitemap listed no portfolio companies");
  }

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    const details = await Promise.all(
      batch.map(async (url) => ({ url, detail: await fetchDetail(url) })),
    );
    for (const { url, detail } of details) {
      if (!detail.name || seen.has(detail.name)) continue;
      seen.add(detail.name);
      companies.push({
        name: detail.name,
        // sector and stage tags, with the head office as the closing detail
        category: [...detail.tags, detail.hq].filter(Boolean).join(", "),
        // the site publishes no company websites, so link its HV page
        url,
      });
    }
    await sleep(BATCH_DELAY_MS);
  }

  // fail loudly rather than importing a partial portfolio, which would make the
  // missing companies reappear as newcomers on a later run
  if (companies.length < urls.length * 0.9) {
    throw new Error(
      `HV Capital portfolio incomplete: got ${companies.length} of ${urls.length} companies`,
    );
  }

  return companies;
}
