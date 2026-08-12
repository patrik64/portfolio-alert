import type { ScrapedCompany } from './types';

const PAGE_URL = "https://behold.vc/portfolio";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// behold publishes its portfolio as a wall of logos with nothing but the link
// under each one, so the names are kept here, keyed on the company's own
// domain (or its logo file, for the two that aren't linked). checked against
// each company's own site; deriveName below covers anything added since.
const NAMES: Record<string, string> = {
  "5fortress.com": "5 Fortress",
  "aurorapunks.com": "Aurora Punks",
  bluescarab: "Blue Scarab Entertainment",
  "counterspellstudios.com": "Counterspell",
  "deadastronauts.games": "Dead Astronauts",
  "eca.gg": "Esports Coaching Academy",
  "eddaheim.com": "Eddaheim",
  // behold still lists this one as Firestoke; its domain now serves Balor Games
  "firestoke.games": "Firestoke",
  flattail: "Flat Tail",
  "honig.games": "Honig Games",
  "lurkit.com": "Lurkit",
  "oddiko.com": "Oddiko",
  "porcelainfortress.com": "Porcelain Fortress",
  "puzzlr.co": "Puzzlr",
  "redroverinteractive.com": "Red Rover Interactive",
  "rorointeractive.com": "Roro",
  "sevenstars.games": "Seven Stars",
  "spellscaper.com": "Spellscaper",
  "sunscorchedstudios.co.uk": "Sunscorched Studios",
  "thegang.io": "The Gang",
  "vitargames.com": "Vitar Games",
  // the studio behind Wartile, whose domain has since left their hands
  "wartile.com": "Playwood Project",
  "wayfindergames.com": "Wayfinder Studios",
  "winterkeep.com": "Winterkeep Interactive",
};

const decode = (s: string) =>
  s
    .replace(/&#0?38;|&amp;/g, "&")
    .replace(/&#0?39;|&#8217;|&#x27;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;|\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const hostOf = (url: string) =>
  url
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .replace(/^www\./, "")
    .toLowerCase();

// "…/Behold_Ventures_Portfolio_Seven_Stars.png" -> "sevenstars"
const fileOf = (src: string) =>
  decodeURIComponent(src.split("?")[0].replace(/^.*\//, ""))
    .replace(/\.(png|jpe?g|svg|webp|gif)$/i, "")
    .replace(/^behold[_ ]ventures[_ ]portfolio[_ ]/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// most of the logos are captioned "Behold Ventures portfolio company <name>",
// which is the best guess left for a company that isn't in the map yet
function deriveName(alt: string, src: string, host: string) {
  const captioned = alt.match(/portfolio company\s+(.+)$/i)?.[1];
  if (captioned) return captioned.trim();
  const stem = decodeURIComponent(src.split("?")[0].replace(/^.*\//, ""))
    .replace(/\.(png|jpe?g|svg|webp|gif)$/i, "")
    .replace(/^behold[_ ]ventures[_ ]portfolio[_ ]/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
  return stem || host.replace(/\.[a-z][a-z.]+$/i, "");
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  // the logos sit under a "Portfolio" heading; anything above it is chrome
  const heading = html.search(/>\s*PORTFOLIO\s*<\/(?:p|h[1-6])>/i);
  const grid = heading < 0 ? html : html.slice(heading);

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();

  for (const block of grid.split('<div class="sqs-block image-block sqs-block-image"').slice(1)) {
    const src = block.match(/data-image="([^"]+)"/)?.[1] ?? "";
    if (!src) continue;
    // the two companies behold doesn't link to still belong in the list
    const url = block.match(/class="\s*sqs-block-image-link[\s\S]{0,200}?href="(https?:\/\/[^"]+)"/)?.[1] ?? "";
    const alt = decode(block.match(/alt="([^"]*)"/)?.[1] ?? "");

    const host = hostOf(url);
    const name = NAMES[host || fileOf(src)] ?? deriveName(alt, src, host);
    if (!name || seen.has(name)) continue;
    seen.add(name);

    // behold invests in one thing — early-stage games — and labels none of it
    companies.push({ name, category: "", url });
  }

  if (companies.length === 0) {
    throw new Error("behold: no companies found in the portfolio grid");
  }

  return companies;
}
