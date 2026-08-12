import type { ScrapedCompany } from './types';

const BASE_URL = "https://01a.com";
// /featured shows a 29-company selection of the same wall; this is all of it
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// The portfolio is a Squarespace wall of logo images with no names and no alt
// text, and the uploaded filenames are mostly "Untitled design (30).png", so the
// only thing identifying a company is the site each logo links to. Names are
// resolved by domain through this list, each one read off that site. An unlisted
// domain still imports, under a name derived from the domain — see deriveName.
const NAMES: Record<string, string> = {
  "airtable.com": "Airtable",
  "attio.com": "Attio",
  "baseten.co": "Baseten",
  "bitdrift.io": "bitdrift",
  "brighthire.com": "BrightHire",
  "buildops.com": "BuildOps",
  "cape.co": "Cape",
  "capchase.com": "Capchase",
  "certn.co": "Certn",
  "collectors.com": "Collectors",
  "commonroom.io": "Common Room",
  "density.io": "Density",
  "electric.ai": "Electric",
  "explorium.ai": "Explorium",
  "fireflyon.com": "Firefly",
  "future.co": "Future",
  "getstream.io": "Stream",
  "haus.io": "Haus",
  "hivewatch.com": "HiveWatch",
  "honeybook.com": "HoneyBook",
  // the logo file is a leftover copy of Siro's
  "laurel.ai": "Laurel",
  "levelpath.com": "Levelpath",
  "linear.app": "Linear",
  "literati.com": "Literati",
  "masterclass.com": "MasterClass",
  "metropolis.io": "Metropolis",
  "micro1.ai": "micro1",
  "modernhealth.com": "Modern Health",
  "mythicalgames.com": "Mythical Games",
  "navan.com": "Navan",
  "nomadhomes.ae": "RemyAI",
  "observe.ai": "Observe.AI",
  "openenvoy.com": "OpenEnvoy",
  "opendoor.com": "Opendoor",
  "papayapay.com": "Papaya",
  "planethowl.com": "Howl",
  "playvs.com": "PlayVS",
  "postscript.io": "Postscript",
  "protectai.com": "Protect AI",
  "rarible.com": "Rarible",
  "render.com": "Render",
  "rho.co": "Rho",
  "semsee.com": "Semsee",
  "siro.ai": "Siro",
  "siterx.com": "SiteRx",
  "split.io": "Split",
  "spoton.com": "SpotOn",
  "sublime.security": "Sublime Security",
  "tipalti.com": "Tipalti",
  "transcend.io": "Transcend",
  "useorigin.com": "Origin Financial",
  "usewheelhouse.com": "Wheelhouse",
  "joinsaturn.com": "Saturn",
  "zafran.io": "Zafran Security",
};

const hostOf = (url: string) =>
  url
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .replace(/^(www|en)\./, "")
    .toLowerCase();

// last resort for a domain the list doesn't know — "get", "use" and "join" are
// domain padding rather than part of the name (getstream.io is Stream)
function deriveName(host: string) {
  const label = host
    .replace(/\.[a-z][a-z.]+$/i, "")
    .replace(/^(?:get|use|join|try|my)(?=[a-z]{3})/i, "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();

  for (const block of html.split('class="sqs-block-image-link').slice(1)) {
    const url = block.match(/href="(https?:\/\/[^"]+)"/)?.[1] ?? "";
    const host = hostOf(url);
    if (!host) continue;

    const name = NAMES[host] ?? deriveName(host);
    if (!name || seen.has(name)) continue;
    seen.add(name);

    // the only status the page carries is written into the logo's filename —
    // "Opendoor IPO.png", "Split Acquired by Harness (1).png"
    const image = decodeURIComponent(
      (block.match(/data-image="([^"]+)"/)?.[1] ?? "").split("?")[0].replace(/\+/g, " "),
    );
    const exited = /\bby\b/i.test(image) || /\bIPO\b/i.test(image);

    companies.push({ name, category: exited ? "Exited" : "", url });
  }

  if (companies.length === 0) {
    throw new Error("01a: no companies found in the portfolio");
  }

  return companies;
}
