import type { ScrapedCompany } from './types';

const BASE_URL = "https://av8.vc";
const PAGE_URL = `${BASE_URL}/our-portfolio/`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Like Superhero, the portfolio is a wall of logo images with no names anywhere
// in the markup — every alt is empty. What each card does carry is a link to the
// company's own site, so names are resolved by domain through this list, each
// one read off that site. The three companies AV8 links nowhere are keyed on
// their logo filename instead. Anything unlisted still imports, under a name
// derived from the filename or the domain — see deriveName.
const NAMES: Record<string, string> = {
  "allin_bio-logo-1-copy": "AllIn Bio",
  "annexrisk.com": "Annex Risk",
  "axuall.com": "Axuall",
  "blueberrylife.com": "Blueberry Life",
  "bravecare.com": "Brave Care",
  "cerby.com": "Cerby",
  "clevercarehealthplan.com": "Clever Care Health Plan",
  "contractwrangler.com": "Contract Wrangler",
  "covertree.com": "CoverTree",
  "crogl.com": "Crogl",
  "curafi.com": "CuraFi",
  "datagalaxy.com": "DataGalaxy",
  "deeded.ca": "Deeded",
  "delfidiagnostics.com": "DELFI Diagnostics",
  "eclypsium.com": "Eclypsium",
  "elucidate.co": "Elucidate",
  "embrace.io": "Embrace",
  "flourish.health": "Flourish Health",
  "glow.co": "Glow",
  "helloalpha.com": "Hello Alpha",
  "hometree.co.uk": "Hometree",
  "hydrolix.io": "Hydrolix",
  "locomation.ai": "Locomation",
  "measured_logo-01": "Measured",
  "morph-logo": "Morph",
  "mqube.com": "MQube",
  "okareo.com": "Okareo",
  "olelife.com": "Olé Life",
  "onemodel.co": "One Model",
  "phenomic.ai": "Phenomic AI",
  "planetiq.com": "PlanetiQ",
  "pulse.qa": "Pulse",
  "reframefinancial.com": "Reframe Financial",
  "rephrase.ai": "Rephrase",
  "shennonbio.com": "Shennon Bio",
  // the logo file says ShennonBio, but the link and the site say otherwise
  "simbiosys.com": "SimBioSys",
  "soteranalytics.com": "SoterAI",
  "swiftshift.com": "SwiftShift",
  "thinkbioscience.com": "Think Bioscience",
  "uizard.io": "Uizard",
  "wax.insure": "Wax Insurance",
  "yuvohealth.com": "Yuvo Health",
};

const decode = (s: string) =>
  s
    .replace(/&#0?38;|&amp;/g, "&")
    .replace(/&#0?39;|&#8217;|&#x27;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const hostOf = (url: string) =>
  url
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .replace(/^(www|en)\./, "")
    .toLowerCase();

const fileOf = (src: string) =>
  src
    .replace(/^.*\//, "")
    .replace(/\.(png|jpe?g|svg|webp|gif)$/i, "")
    .toLowerCase();

// last resort for a company the list doesn't know: the logo filename stripped of
// its decoration, or the domain when the filename carries no name of its own
function deriveName(file: string, host: string) {
  const stem = file
    .replace(/[_-]?logo.*$/i, "")
    .replace(/[_-]?\d+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();
  const base = stem.length < 3 ? host.replace(/\.[a-z][a-z.]+$/i, "") || stem : stem;
  return base === base.toLowerCase() ? base.charAt(0).toUpperCase() + base.slice(1) : base;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();
  const body = html.slice(html.indexOf("<body")).replace(/<style[\s\S]*?<\/style>/g, "");

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  let section = "";

  // the page is one Divi stack: a heading names the sector, the logo modules
  // under it are its companies, and the last heading is the exits
  const pattern =
    /<h2[^>]*>([\s\S]*?)<\/h2>|<div class="et_pb_module et_pb_image [^"]*">\s*(?:<a href="([^"]*)"[^>]*>)?\s*<span class="et_pb_image_wrap[^>]*>\s*<img([^>]*)>/g;
  for (const match of body.matchAll(pattern)) {
    const [, heading, href, attrs] = match;
    if (heading !== undefined) {
      section = decode(heading);
      continue;
    }

    const src = attrs.match(/src="([^"]+)"/)?.[1] ?? "";
    if (!src) continue;
    // companies AV8 has no live site for are linked to "#"
    const url = href?.startsWith("http") ? href : "";
    const file = fileOf(src);
    const host = hostOf(url);

    const name = NAMES[host || file] ?? deriveName(file, host);
    if (!name || seen.has(name)) continue;
    seen.add(name);

    companies.push({
      name,
      // "Exits" is where a company ends up, not what it does
      category: /^exits?$/i.test(section) ? "Exited" : section,
      url,
    });
  }

  if (companies.length === 0) {
    throw new Error("av8: no companies found in the portfolio");
  }
  // without the headings every company would import uncategorised
  if (!companies.some((company) => company.category)) {
    throw new Error("av8: portfolio sections not found — the page layout moved");
  }

  return companies;
}
