import type { ScrapedCompany } from './types';

const PAGE_URL = "https://www.lakestar.com/funds";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// lakestar publishes its portfolio as a wall of logos linking out to each
// company, with no name in the markup, so the names are kept here keyed on
// the company's own domain. checked against each company's own site;
// deriveName below covers anything added since.
const NAMES: Record<string, string> = {
  "auterion.com": "Auterion",
  "constellr.com": "Constellr",
  "dexory.com": "Dexory",
  "exein.io": "Exein",
  "fuseenergy.com": "Fuse Energy",
  "harrys.com": "Harry's",
  "hometogo.de": "HomeToGo",
  "isaraerospace.com": "Isar Aerospace",
  "nekohealth.com": "Neko Health",
  "poolside.ai": "Poolside",
  "public.com": "Public",
  "revolut.com": "Revolut",
  "sennder.com": "Sennder",
  "spotify.com": "Spotify",
  "vertice.one": "Vertice",
};

const NAMED: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };

const decode = (s: string) =>
  s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (whole, dec, hex, named) => {
    if (dec) return String.fromCodePoint(Number(dec));
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    return NAMED[String(named).toLowerCase()] ?? whole;
  });

// the registrable domain: the last two labels, so open.spotify.com and
// de.harrys.com key the same as their bare domains
const hostOf = (url: string) =>
  url
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .toLowerCase()
    .split(".")
    .slice(-2)
    .join(".");

// "…/Isar-7.png" -> "Isar": the logo file name is the best guess left for a
// company that isn't in the map yet
const deriveName = (logoUrl: string, host: string) => {
  const stem = decodeURIComponent(logoUrl.split("?")[0].replace(/^.*\//, ""))
    .replace(/\.(png|jpe?g|svg|webp|gif)$/i, "")
    .replace(/[-_]\d+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return stem || host.replace(/\.[a-z][a-z.]+$/i, "");
};

// the company records ride in the react flight payload, one escaped string
// chunk per script tag
function flightPayload(html: string): string {
  const chunks: string[] = [];
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,\s*"((?:[^"\\]|\\.)*)"\]\)/g)) {
    try {
      chunks.push(JSON.parse(`"${m[1]}"`));
    } catch {
      // a chunk that isn't a plain string carries no company data
    }
  }
  return chunks.join("");
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const payload = flightPayload(await resp.text());

  // the companies ride in the next flight payload as logo/link pairs
  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  for (const m of payload.matchAll(
    /"url":"(\/wp-content\/uploads\/[^"]+\.(?:png|jpe?g|svg|webp))"\}[^{}]*?"link":\{"title":"[^"]*","url":"(https?:[^"]*)"/g,
  )) {
    const logoUrl = m[1];
    const url = decode(m[2]);
    const host = hostOf(url);
    const name = NAMES[host] ?? deriveName(logoUrl, host);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    // lakestar labels its logo wall with no sector or status
    companies.push({ name, category: "", url });
  }

  if (companies.length === 0) {
    throw new Error("lakestar: no companies found in the portfolio wall");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("lakestar: the companies' website links moved");
  }

  return companies;
}
