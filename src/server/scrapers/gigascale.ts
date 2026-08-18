import type { ScrapedCompany } from './types';

const PAGE_URL = "https://gigascale.com/portfolio/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// gigascale publishes its portfolio as a wall of hexagon logos with nothing
// but the link and a one-line blurb under each one, so the names are kept
// here, keyed on the company's own domain. checked against each company's own
// site; deriveName below covers anything added since.
const NAMES: Record<string, string> = {
  "alkali.engineering": "Alkali",
  "arbor.co": "Arbor",
  "getarch.com": "Arch",
  "cocooncarbon.com": "Cocoon Carbon",
  "cfs.energy": "Commonwealth Fusion Systems",
  "dioxycle.com": "Dioxycle",
  "estes.energy": "Estes Energy",
  "firstelementexploration.com": "First Element Exploration",
  "formenergy.com": "Form Energy",
  "fractile.ai": "Fractile",
  "heronpower.com": "Heron Power",
  "homeboost.com": "Homeboost",
  "poweredbylight.com": "Light",
  "mill.com": "Mill",
  "nyquis.com": "Nyquis",
  "panthalassa.com": "Panthalassa",
  "pasturebio.com": "Pasture Biosciences",
  "radiantnuclear.com": "Radiant",
  "redmetals.com": "Red Metals",
  "rhoda.ai": "Rhoda",
  "skouria.com": "Skouria",
  "solcoaindustries.com": "Solcoa",
  "terradot.earth": "Terradot",
  "terraton.ai": "Terraton",
  "thalolabs.com": "Thalo Labs",
  "vorsystems.com": "Vor Systems",
  "xcimer.energy": "Xcimer Energy",
};

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

const hostOf = (url: string) =>
  url
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .replace(/^www\./, "")
    .toLowerCase();

// "…/Pasture_Biosciences_Logo_blk.png" -> "Pasture Biosciences": the logo
// file name is the best guess left for a company that isn't in the map yet
function deriveName(src: string, host: string) {
  const stem = decodeURIComponent(src.split("?")[0].replace(/^.*\//, ""))
    .replace(/\.(png|jpe?g|svg|webp|gif)$/i, "")
    .replace(/-\d+x\d+$/, "");
  const words = stem
    .split(/[_-]+/)
    .filter((word) => word && !/^(logo|horiz|horizontal|blk|black|ash|white|wht|\d+)$/i.test(word));
  return words.join(" ").trim() || host.replace(/\.[a-z][a-z.]+$/i, "");
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  for (const block of html.split(/<div class="portfolio (?:right|left)[^"]*">/).slice(1)) {
    const url = block.match(/<a href="(https?:\/\/[^"]+)" target="_blank"/)?.[1] ?? "";
    const src = block.match(/<img [^>]*src="([^"]+)"/)?.[1] ?? "";
    if (!url && !src) continue;

    const host = hostOf(url);
    const name = NAMES[host] ?? deriveName(src, host);
    if (!name || seen.has(name)) continue;
    seen.add(name);

    companies.push({
      name,
      // the one-line blurb is the only classification the wall publishes
      category: text(block.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? ""),
      url,
    });
  }

  if (companies.length === 0) {
    throw new Error("gigascale: no companies found in the portfolio wall");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("gigascale: the companies' blurbs moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("gigascale: the companies' website links moved");
  }

  return companies;
}
