import type { ScrapedCompany } from './types';

const PAGE_URL = "https://www.xyz.vc/portfolio";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&#x27;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();

// the gallery publishes no company names; most captions open with the company
// ("Apex manufactures satellite buses…"), so take the leading capitalised words
function nameFromCaption(alt: string): string {
  if (!alt || /\.(jpe?g|png|webp|svg)$/i.test(alt)) return "";
  const words: string[] = [];
  for (const word of alt.split(/\s+/)) {
    // keep leading capitalised words, plus forms like "eBay" or "iRobot"
    if (/^[A-Z0-9]/.test(word) || (words.length > 0 && /^[a-z]{1,2}[A-Z]/.test(word))) {
      words.push(word);
    } else {
      break;
    }
  }
  const name = words.join(" ").replace(/[ ,.:;]+$/, "");
  return name.length >= 1 && name.length <= 40 ? name : "";
}

// otherwise fall back to the company's own domain
function nameFromUrl(url: string): string {
  const host = url
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .replace(/^www\./, "");
  const base = host.split(".")[0];
  return base
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();

  for (const raw of html.split('<figure class="gallery-grid-item').slice(1)) {
    const item = raw.split("</figure>")[0];
    const url = item.match(/href="(https?:\/\/[^"]+)"/)?.[1];
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const alt = decode(item.match(/alt="([^"]*)"/)?.[1] ?? "");
    const name = nameFromCaption(alt) || nameFromUrl(url);
    if (!name) continue;

    companies.push({ name, category: "", url });
  }

  if (companies.length === 0) {
    throw new Error("xyz: no companies found in the portfolio gallery");
  }

  return companies;
}
