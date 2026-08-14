import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.credoventures.com";
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// credo shows most of its companies as a logo drawn in the page, with nothing
// written anywhere to name them — only the address the item is filed under. a
// slug spells most names correctly once split and capitalised; these are the
// ones whose own spelling differs from that
const NAMES: Record<string, string> = {
  "dcs-plus": "DCS Plus",
  "eleven-labs": "ElevenLabs",
  goodvision: "GoodVision",
  ipfabric: "IP Fabric",
  "kontakt-io": "Kontakt.io",
  publishdrive: "PublishDrive",
  trustpath: "TrustPath",
  typingdna: "TypingDNA",
  uipath: "UiPath",
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

// "kurs-orbital" -> "Kurs Orbital", "duvo-ai" -> "Duvo AI"
const derive = (slug: string) =>
  slug
    .split("-")
    .map((word) => (word === "ai" ? "AI" : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");

async function fetchPage(url: string) {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const html = await fetchPage(PAGE_URL);

  // every company is laid out once per screen size, so the item is cut at the
  // next one rather than at the next thing that looks like a company
  const starts = [...html.matchAll(/data-framer-name="portfolio-item" id="([^"]*)"/g)];
  if (starts.length === 0) {
    throw new Error("credo: no companies found in the portfolio");
  }

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  for (const [i, start] of starts.entries()) {
    const item = html.slice(start.index ?? 0, starts[i + 1]?.index ?? html.length);
    // framer builds the id from the company's slug and the layout it belongs to
    const slug = start[1].replace(/-[0-9a-z]{6,8}$/, "");
    if (!slug) continue;

    // the companies credo no longer holds are written out instead of drawn
    const written = text(
      item.match(
        /data-framer-name="name" data-framer-component-type="RichTextContainer"[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>/,
      )?.[1] ?? "",
    );
    const name = written || NAMES[slug] || derive(slug);
    if (seen.has(name)) continue;
    seen.add(name);

    const exited = item.includes('data-framer-name="status-exited"');
    // a company that has died is not one credo got out of
    const rip = item.includes('data-framer-name="status-rip"');

    companies.push({
      name,
      category: [exited ? "Exited" : "", rip ? "RIP" : ""].filter(Boolean).join(", "),
      // credo shows its companies without linking to them
      url: "",
    });
  }

  if (companies.length === 0) {
    throw new Error("credo: no company could be named — the portfolio items moved");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("credo: the portfolio's statuses moved");
  }

  return companies;
}
