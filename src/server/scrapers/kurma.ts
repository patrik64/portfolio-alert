import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.kurmapartners.com";
const PAGE_URL = `${BASE_URL}/en/portfolio`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#0?38;|&amp;/g, "&")
    .replace(/&#0?39;|&#8217;|&#x27;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&nbsp;|\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// the cards carry their sector lowercased ("agtech"); the page's own filter is
// where it's spelled the way Kurma writes it
function sectorLabels(html: string) {
  const select = html.match(/<select id="categories_parent"[\s\S]*?<\/select>/)?.[0] ?? "";
  const labels = new Map<string, string>();
  for (const option of select.matchAll(/<option value="([^"]+)"[^>]*>([\s\S]*?)<\/option>/g)) {
    labels.set(option[1].toLowerCase(), text(option[2]));
  }
  return labels;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  const labels = sectorLabels(html);
  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();

  // every company is one flip card: the logo on the front, its name, fund and
  // partner on the back, and everything the filters key on in data attributes
  for (const card of html.split('<div class="flip-container"').slice(1)) {
    const attrs = card.slice(0, card.indexOf(">"));
    const name = text(card.match(/<span class="title-name"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "");
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const sector = attrs.match(/data-secteur="([^"]*)"/)?.[1] ?? "";
    // "cédée/sortie" — divested; the rest are marked "0" or left blank
    const exited = attrs.match(/data-cedee-sortie="([^"]*)"/)?.[1] === "1";
    // the whole card links to the company, and so does the chain icon on its
    // back; companies Kurma has no site for carry neither
    const url =
      card.match(/<span href="(https?:\/\/[^"]+)"/)?.[1] ??
      card.match(/<a href="(https?:\/\/[^"]+)"[^>]*><i class="fa fa-link/)?.[1] ??
      "";

    companies.push({
      name,
      category: [labels.get(sector) ?? sector, exited ? "Exited" : ""].filter(Boolean).join(", "),
      url,
    });
  }

  if (companies.length === 0) {
    throw new Error("kurma: no companies found in the portfolio grid");
  }
  // without the data attributes every company would import uncategorised
  if (!companies.some((company) => company.category)) {
    throw new Error("kurma: portfolio sectors not found — the card markup moved");
  }

  return companies;
}
