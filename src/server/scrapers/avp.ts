import type { ScrapedCompany } from './types';

const BASE_URL = "https://avpcap.com";
const PAGE_URL = `${BASE_URL}/companies/`;
// exits are only marked on the taxonomy archive, which pages 10 at a time
const EXITED_URL = `${BASE_URL}/project-type/exited`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BATCH_SIZE = 8;
const BATCH_DELAY_MS = 300;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const decode = (s: string) =>
  s
    .replace(/&#0?38;|&amp;/g, "&")
    .replace(/&#0?39;|&#x27;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, "–")
    .trim();

interface Detail {
  sector: string;
  stage: string;
  location: string;
  website: string;
}

// every company page is the same WPBakery stack of text columns: the sector,
// the description, then label/value pairs (stage, lead partner, founded, …)
async function fetchDetail(url: string, attempt = 1): Promise<Detail | null> {
  try {
    const resp = await fetch(url, { headers: { "User-Agent": UA } });
    if (!resp.ok) throw new Error(`${resp.status}`);
    const html = await resp.text();

    const columns = [
      ...html.matchAll(/<div class="wpb_text_column wpb_content_element[^"]*">([\s\S]*?)<\/div>/g),
    ].map((m) => decode(m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")));

    const valueOf = (...labels: string[]) => {
      for (const label of labels) {
        const at = columns.indexOf(label);
        if (at >= 0) return columns[at + 1] ?? "";
      }
      return "";
    };

    // the sector heads the page, above the description — except on the handful
    // of exit announcements, which put the status there and name no sector
    const heading = columns[0] ?? "";
    const sector = heading && heading !== "Exited" && heading.length < 60 && !heading.endsWith(".")
      ? heading
      : "";

    return {
      sector,
      stage: valueOf("Investment stage", "Stage"),
      location: valueOf("Location"),
      website:
        html.match(
          /<a class="nectar-button[^"]*"[^>]*href="(https?:\/\/[^"]+)"[^>]*>\s*<span>Visit website/,
        )?.[1] ?? "",
    };
  } catch {
    if (attempt < 3) {
      await sleep(1000 * attempt);
      return fetchDetail(url, attempt + 1);
    }
    return null;
  }
}

// walk the exited archive until a page 404s or repeats nothing new
async function fetchExited(): Promise<Set<string>> {
  const slugs = new Set<string>();
  for (let page = 1; page <= 20; page++) {
    const url = page === 1 ? `${EXITED_URL}/` : `${EXITED_URL}/page/${page}/`;
    const resp = await fetch(url, { headers: { "User-Agent": UA } });
    if (resp.status === 404) break;
    if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
    const html = await resp.text();
    const found = [...html.matchAll(/<a href="https:\/\/avpcap\.com\/avp\/([^"/]+)\/"><\/a>/g)].map(
      (m) => m[1],
    );
    if (found.length === 0) break;
    for (const slug of found) slugs.add(slug);
  }
  return slugs;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  const listed: { name: string; page: string; slug: string }[] = [];
  const seen = new Set<string>();
  for (const item of html.split('<div class="nectar-post-grid-item').slice(1)) {
    const page = item.match(/<a class="nectar-post-grid-link" href="([^"]+)"/)?.[1] ?? "";
    const name = decode(item.match(/class="post-heading"><span>([^<]+)</)?.[1] ?? "");
    if (!name || !page || seen.has(name)) continue;
    seen.add(name);
    listed.push({ name, page, slug: page.replace(/.*\/avp\/|\/$/g, "") });
  }
  if (listed.length === 0) {
    throw new Error("avp: no companies found in the portfolio grid");
  }

  const exited = await fetchExited();

  const fetched: { entry: (typeof listed)[number]; detail: Detail }[] = [];
  for (let i = 0; i < listed.length; i += BATCH_SIZE) {
    const batch = listed.slice(i, i + BATCH_SIZE);
    const details = await Promise.all(
      batch.map(async (entry) => ({ entry, detail: await fetchDetail(entry.page) })),
    );
    for (const { entry, detail } of details) {
      if (detail) fetched.push({ entry, detail });
    }
    await sleep(BATCH_DELAY_MS);
  }

  // the sectors are hand-typed per page, so the same one turns up in different
  // casings ("Enterprise software"); settle on the spelling used most often
  const spellings = new Map<string, Map<string, number>>();
  for (const { detail } of fetched) {
    if (!detail.sector) continue;
    const key = detail.sector.toLowerCase();
    const variants = spellings.get(key) ?? new Map<string, number>();
    variants.set(detail.sector, (variants.get(detail.sector) ?? 0) + 1);
    spellings.set(key, variants);
  }
  const canonicalSector = new Map(
    [...spellings].map(([key, variants]) => [
      key,
      [...variants].sort((a, b) => b[1] - a[1])[0][0],
    ]),
  );

  const companies: ScrapedCompany[] = fetched.map(({ entry, detail }) => ({
    name: entry.name,
    category: [
      canonicalSector.get(detail.sector.toLowerCase()) ?? detail.sector,
      detail.stage,
      detail.location,
      exited.has(entry.slug) ? "Exited" : "",
    ]
      .filter(Boolean)
      .join(", "),
    // the company's own site when AVP links it, its AVP page otherwise
    url: detail.website || entry.page,
  }));

  // fail loudly rather than importing a partial portfolio, which would make the
  // missing companies reappear as newcomers on a later run
  if (companies.length < listed.length * 0.95) {
    throw new Error(
      `AVP portfolio incomplete: got ${companies.length} of ${listed.length} companies`,
    );
  }

  return companies;
}
