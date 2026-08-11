import type { ScrapedCompany } from './types';

const PAGE_URL = "https://atlasventure.com/portfolio/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const decode = (s: string) =>
  s
    .replace(/&amp;|&#038;/g, "&")
    .replace(/&#8217;/g, "'")
    .trim();

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  const companies: ScrapedCompany[] = [];
  const tiles = html.split(/<article\s+class="company-tile/).slice(1);

  for (const rawTile of tiles) {
    const tile = rawTile.split("</article>")[0];
    const name = tile.match(/<div class="title"[^>]*>([^<]+)<\/div>/)?.[1];
    if (!name) continue;

    // company status badges are SVG images (incubated.svg, seeded.svg)
    const badges = new Set(
      [...tile.matchAll(/uploads\/[0-9/]+\/([a-z-]+)\.svg/g)].map(
        (m) => m[1].charAt(0).toUpperCase() + m[1].slice(1),
      ),
    );

    const url =
      tile.match(/href="(https?:\/\/(?!atlasventure\.com)[^"]+)"/)?.[1] ?? "";

    companies.push({
      name: decode(name),
      category: [...badges].join(", "),
      url,
    });
  }

  return companies;
}
