import type { ScrapedCompany } from './types';

const PAGE_URL = "https://www.racap.com/portfolio";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
// racap.com rejects aggressive parallel fetching — keep batches small,
// pause between them, and retry failures once
const BATCH_SIZE = 8;
const BATCH_DELAY_MS = 300;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const clean = (s: string) =>
  s
    .replace(/&amp;|&#038;/g, "&")
    .replace(/&#8217;|’/g, "'")
    .replace(/​/g, "")
    .trim();

const ddValue = (html: string, label: string) =>
  html.match(
    new RegExp(`<dt[^>]*>\\s*${label}\\s*</dt>\\s*<dd[^>]*>\\s*([^<]+?)\\s*</dd>`),
  )?.[1] ?? "";

// detail pages carry a spec list (Domain, Status, ...) and the company website
async function fetchDetail(
  path: string,
  attempt = 1,
): Promise<{ domain: string; status: string; website: string }> {
  try {
    const resp = await fetch(path, { headers: { "User-Agent": UA } });
    if (!resp.ok) throw new Error(`${resp.status}`);
    const html = await resp.text();
    const website =
      html.match(/<a\s[^>]*href="(https?:\/\/[^"]+)"[^>]*>\s*<span>Website<\/span>/)?.[1] ?? "";
    return {
      domain: clean(ddValue(html, "Domain")),
      status: clean(ddValue(html, "Status")),
      website,
    };
  } catch {
    if (attempt < 3) {
      await sleep(1000 * attempt);
      return fetchDetail(path, attempt + 1);
    }
    return { domain: "", status: "", website: "" };
  }
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  interface Entry {
    name: string;
    path: string;
  }
  const entries: Entry[] = [];
  const seen = new Set<string>();

  for (const article of html.split("<article v-show=").slice(1)) {
    const chunk = article.split("</article>")[0];
    const name = chunk.match(/<div class="type-ui-2">\s*([^<]+?)\s*<\/div>/)?.[1];
    const path = chunk.match(/<a\s[^>]*href="(https:\/\/www\.racap\.com\/portfolio\/[^"]+)"/)?.[1];
    if (!name || !path || seen.has(path)) continue;
    seen.add(path);
    entries.push({ name: clean(name), path });
  }

  const detailByPath = new Map<string, { domain: string; status: string; website: string }>();
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (e) => ({ path: e.path, detail: await fetchDetail(e.path) })),
    );
    for (const r of results) {
      detailByPath.set(r.path, r.detail);
    }
    await sleep(BATCH_DELAY_MS);
  }

  const companies: ScrapedCompany[] = entries.map((e) => {
    const detail = detailByPath.get(e.path) ?? { domain: "", status: "", website: "" };
    return {
      name: e.name,
      category: [detail.domain, detail.status].filter(Boolean).join(", "),
      url: detail.website || e.path,
    };
  });

  return companies;
}
