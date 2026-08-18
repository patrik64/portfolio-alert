import type { ScrapedCompany } from './types';

const PAGE_URL = "https://atomico.com/partners";
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

// atomico's card links carry the display name in an aria-label; where the
// featured cards leave that blank the slug is the fallback, special-cased for
// the handful the plain title-casing would get wrong
const NAMES: Record<string, string> = {
  coderabbit: "CodeRabbit",
  openfx: "OpenFX",
  psiquantum: "PsiQuantum",
  physicsx: "PhysicsX",
  caddi: "CADDi",
  claimsorted: "ClaimSorted",
  jobandtalent: "Job&Talent",
  deepl: "DeepL",
  deeploi: "deeploi",
  tem: "tem",
};

const nameFromSlug = (slug: string) =>
  NAMES[slug] ??
  slug
    .split("-")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");

export async function scrape(): Promise<ScrapedCompany[]> {
  // note: atomico fronts its whole origin with vercel's bot challenge, which
  // answers non-browser clients with a 429 "security checkpoint" page — this
  // fetch fails from the server, so the fund cannot refresh in production
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  // every company is a card linking to its /partners/<slug> profile; the name
  // rides on the anchor's aria-label
  for (const m of html.matchAll(/<a\b([^>]*\bhref="\/partners\/([a-z0-9-]+)"[^>]*)>/g)) {
    const slug = m[2];
    if (seen.has(slug)) continue;
    seen.add(slug);
    const aria = text(m[1].match(/aria-label="([^"]*)"/)?.[1] ?? "");
    companies.push({
      name: aria || nameFromSlug(slug),
      // the listing publishes no sector or status alongside the logo wall
      category: "",
      url: "",
    });
  }

  if (companies.length === 0) {
    throw new Error("atomico: no companies found in the partnerships list");
  }

  return companies;
}
