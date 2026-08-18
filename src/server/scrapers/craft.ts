import type { ScrapedCompany } from './types';

const PAGE_URL = "https://www.craftventures.com/portfolio";
const MAX_PAGES = 20;
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

export async function scrape(): Promise<ScrapedCompany[]> {
  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  let pageParam = "";

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = page === 1 ? PAGE_URL : `${PAGE_URL}?${pageParam}=${page}`;
    const html = await fetchPage(url);
    if (page === 1) {
      // webflow's own pagination names the query parameter in the next link
      pageParam = html.match(/href="\?([a-z0-9_]+_page)=2"/)?.[1] ?? "";
    }

    let added = 0;
    // the card's outbound link closes it, so the card's own fields are the
    // last ones rendered before the anchor — bounded by the previous card's
    // anchor, so a missing field never borrows the neighbor's value
    let prevEnd = 0;
    for (const m of html.matchAll(
      /<a href="(https?:\/\/[^"]+)" target="_blank" class="card-link-block/g,
    )) {
      const at = m.index ?? 0;
      const card = html.slice(Math.max(prevEnd, at - 4000), at);
      prevEnd = at + m[0].length;
      const names = [...card.matchAll(/text-size-medium[^"]*"[^>]*>([^<]+)</g)];
      const name = text(names.at(-1)?.[1] ?? "");
      if (!name || seen.has(name)) continue;
      seen.add(name);

      const year = [...card.matchAll(/Invested<\/div><p class="text-size-tiny">(\d{4})/g)].at(-1);
      // the featured cards label their stage "Stage", the grid cards hold it
      // in a stage-holder block
      const stage = [
        ...card.matchAll(
          /(?:Stage<\/div>|stage-holder">)[\s\S]{0,200}?<p class="text-size-tiny">([^<]+)<\/p>/g,
        ),
      ].at(-1);
      // "IPO on May 18, 2012", "Acquired by Ford in 2018" — the exit as craft
      // states it
      const exitNote = [...card.matchAll(/text-color-yellow[^"]*">([^<]+)</g)].at(-1);

      companies.push({
        name,
        // "Led Series C, 2023" — the round as craft states it, and the year
        category: [text(stage?.[1] ?? ""), year?.[1] ?? "", text(exitNote?.[1] ?? "")]
          .filter(Boolean)
          .join(", "),
        url: m[1],
      });
      added++;
    }

    if (page === 1 && added === 0) {
      throw new Error("craft: no companies found in the portfolio");
    }
    if (added === 0 || !pageParam) break;
  }

  if (!companies.some((company) => company.category)) {
    throw new Error("craft: the stage and year columns moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("craft: the companies' website links moved");
  }

  return companies;
}
