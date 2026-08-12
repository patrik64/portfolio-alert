import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.2150.vc";
const PAGE_URL = `${BASE_URL}/investments`;
const BATCH_SIZE = 8;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#0?38;|&amp;/g, "&")
    .replace(/&#0?39;|&#8217;|&#x27;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&#8203;|&#x200b;|\u200b/gi, "")
    .replace(/&nbsp;|\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function fetchPage(url: string) {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return resp.text();
}

// framer regenerates its class names on every publish, so everything here keys
// on the names the components were given in the designer
async function detailOf(slug: string) {
  const html = await fetchPage(`${PAGE_URL}/${slug}`);

  // the page is a list of labelled facts: company, year, location, status
  const facts = new Map<string, string>();
  for (const fact of html.matchAll(
    /data-framer-name="Client Label"[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>\s*<\/div>\s*<div[^>]*data-framer-name="Client"[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>/g,
  )) {
    const label = text(fact[1]);
    if (!facts.has(label)) facts.set(label, text(fact[2]));
  }

  // the industries are a list rather than a single value, fenced by the markers
  // framer leaves around one — the same label is reused further down the page
  const industries: string[] = [];
  const listed =
    html.match(
      /data-framer-name="Client Label"[^>]*>\s*<p[^>]*>\s*Industries\s*<\/p>([\s\S]*?)<!--\/\$-->/,
    )?.[1] ?? "";
  for (const entry of listed.matchAll(/data-framer-name="Title"[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>/g)) {
    const industry = text(entry[1]);
    if (industry && !industries.includes(industry)) industries.push(industry);
  }

  return {
    name: facts.get("Company") ?? "",
    year: facts.get("Initial Investment") ?? "",
    location: facts.get("Location") ?? "",
    status: facts.get("Status") ?? "",
    industries,
    url:
      html.match(/href="(https?:\/\/[^"]+)"[^>]*rel="noopener"[^>]*>[\s\S]{0,600}?View website/)?.[1] ??
      "",
  };
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const html = await fetchPage(PAGE_URL);

  // the grid is rendered once per breakpoint, so each company links three times
  const slugs = [
    ...new Set(
      [...html.matchAll(/data-framer-name="Project Thumbnail" href="\.\/investments\/([a-z0-9-]+)"/g)].map(
        (m) => m[1],
      ),
    ),
  ];
  if (slugs.length === 0) {
    throw new Error("2150: no companies found in the investments grid");
  }

  // one page per company, and the sitemap lists them all
  const sitemap = await fetchPage(`${BASE_URL}/sitemap.xml`);
  const published = new Set(
    [...sitemap.matchAll(/<loc>[^<]*\/investments\/([^<\/]+?)\/?<\/loc>/g)].map((m) => m[1]),
  );
  if (published.size > 0) {
    for (const slug of slugs) {
      if (!published.has(slug)) throw new Error(`2150: ${slug} is in the grid but not the sitemap`);
    }
    for (const slug of published) {
      if (!slugs.includes(slug)) throw new Error(`2150: ${slug} is in the sitemap but not the grid`);
    }
  }

  const companies: ScrapedCompany[] = [];
  for (let i = 0; i < slugs.length; i += BATCH_SIZE) {
    const batch = await Promise.all(slugs.slice(i, i + BATCH_SIZE).map(detailOf));
    for (const detail of batch) {
      if (!detail.name) {
        throw new Error("2150: a company page named no company — the page layout moved");
      }
      companies.push({
        name: detail.name,
        // every company is either one 2150 still holds or one it has left
        category: [
          ...detail.industries,
          detail.location,
          detail.year,
          detail.status === "Exited" ? "Exited" : "",
        ]
          .filter(Boolean)
          .join(", "),
        url: detail.url,
      });
    }
  }

  if (!companies.some((company) => company.category)) {
    throw new Error("2150: the company pages' key facts moved");
  }

  return companies;
}
