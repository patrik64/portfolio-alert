import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.luxcapital.com";
const BATCH_SIZE = 16;
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
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await fetch(url, { headers: { "User-Agent": UA } });
      if (!resp.ok) {
        throw new Error(`Failed to fetch ${url}: ${resp.status}`);
      }
      return await resp.text();
    } catch (err) {
      lastError = err;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  throw lastError;
}

// the grid page shows a couple dozen featured companies; the sitemap is what
// enumerates the whole portfolio, one profile page per company
async function detailOf(slug: string): Promise<ScrapedCompany | null> {
  let html: string;
  try {
    html = await fetchPage(`${BASE_URL}/companies/${slug}`);
  } catch (err) {
    // the sitemap keeps entries for profiles that have since been taken down
    if (err instanceof Error && err.message.endsWith(": 404")) return null;
    throw err;
  }

  const name = text(html.match(/company-detail_title[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "");
  if (!name) return null;

  // the company's own details are the first details block on the page — the
  // ones after it belong to the "similar companies" modals
  const own = html.match(/company-details_component"([\s\S]*?)company-detail_buttons/)?.[1] ?? "";
  const section = (label: string) =>
    own.match(
      new RegExp(`${label}<\\/div><\\/div>[\\s\\S]{0,200}?company-details_text w-richtext">([\\s\\S]*?)<\\/div>`),
    )?.[1] ?? "";
  const industries = [...section("industries").matchAll(/<p>([\s\S]*?)<\/p>/g)]
    .map((m) => text(m[1]))
    .filter(Boolean);
  // milestones list lux's own moves plus the company's exits ("Acquired by
  // J&J: 2019"); the exits are kept as lux states them
  const milestones = [...section("Milestones").matchAll(/<p>([\s\S]*?)<\/p>/g)]
    .map((m) => text(m[1]))
    .filter((line) => line && !/^lux\s/i.test(line));

  return {
    name,
    category: [...industries, ...milestones].filter(Boolean).join(", "),
    // most profiles publish no website; the visible button carries one when
    // lux does
    url:
      html.match(
        /<a href="(https?:\/\/[^"]+)" class="button_component is-accent is-company-detail w-inline-block">/,
      )?.[1] ?? "",
  };
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const sitemap = await fetchPage(`${BASE_URL}/sitemap.xml`);
  const slugs = [
    ...new Set(
      [...sitemap.matchAll(/<loc>https:\/\/www\.luxcapital\.com\/companies\/([^<]+)<\/loc>/g)].map(
        (m) => m[1],
      ),
    ),
  ];
  if (slugs.length === 0) {
    throw new Error("lux: no company pages in the sitemap");
  }

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < slugs.length; i += BATCH_SIZE) {
    const batch = await Promise.all(slugs.slice(i, i + BATCH_SIZE).map(detailOf));
    for (const company of batch) {
      if (!company || seen.has(company.name)) continue;
      seen.add(company.name);
      companies.push(company);
    }
  }

  if (companies.length === 0) {
    throw new Error("lux: no company was named — the profile layout moved");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("lux: the industry and milestone sections moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("lux: the companies' website links moved");
  }

  return companies;
}
