import type { ScrapedCompany } from './types';

const BASE_URL = "https://broocknell.com";
const SITEMAP_URL = `${BASE_URL}/sitemap.xml`;
const BATCH_SIZE = 8;
// the sitemap lists the site's few fixed pages beside the project pages
const STATIC_PAGES = new Set(["", "all-projects", "contact", "about", "error", "404"]);
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const NAMED: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };

const decode = (s: string) =>
  s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (whole, dec, hex, named) => {
    if (dec) return String.fromCodePoint(Number(dec));
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    return NAMED[String(named).toLowerCase()] ?? whole;
  });

const text = (s: string) =>
  decode(s.replace(/<[^>]+>/g, " "))
    .replace(/\u200b/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function fetchPage(url: string) {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return resp.text();
}

// the portfolio page draws its projects as pictures without writing anything;
// the page built for each project is where its facts are, each under the words
// naming it — a "-" is a fact left unfilled
async function detailOf(slug: string): Promise<ScrapedCompany> {
  const html = await fetchPage(`${BASE_URL}/${slug}`);

  const name = text(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "");
  if (!name) {
    throw new Error(`broocknell: ${slug} names no company — the page layout moved`);
  }

  const fact = (label: string) => {
    const value = text(
      html.match(
        new RegExp(`>\\s*${label}\\s*</h3>\\s*<p[^>]*>([\\s\\S]*?)</p>`),
      )?.[1] ?? "",
    );
    // one year was typed with the "-" of an unfilled fact still in front of it
    return value === "-" ? "" : value.replace(/^-\s*/, "");
  };

  return {
    name,
    category: [fact("Business area"), fact("Round"), fact("Invested in")].filter(Boolean).join(", "),
    url:
      html.match(/>\s*Website\s*<\/h3>\s*<a href="(https?:\/\/[^"]+)"/)?.[1] ?? "",
  };
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const sitemap = await fetchPage(SITEMAP_URL);
  const slugs = [
    ...new Set(
      [...sitemap.matchAll(/<loc>https:\/\/broocknell\.com\/?([^<]*?)\/?<\/loc>/g)]
        .map((m) => decode(m[1]).trim())
        .filter((slug) => !STATIC_PAGES.has(slug)),
    ),
  ];
  if (slugs.length === 0) {
    throw new Error("broocknell: no project pages in the sitemap");
  }

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < slugs.length; i += BATCH_SIZE) {
    const batch = await Promise.all(slugs.slice(i, i + BATCH_SIZE).map(detailOf));
    for (const company of batch) {
      if (seen.has(company.name)) continue;
      seen.add(company.name);
      companies.push(company);
    }
  }

  if (companies.length === 0) {
    throw new Error("broocknell: no companies found");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("broocknell: the project pages' facts moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("broocknell: the project pages' website links moved");
  }

  return companies;
}
