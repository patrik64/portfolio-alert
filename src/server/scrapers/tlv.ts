import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.tlv.partners";
const PAGE_URL = `${BASE_URL}/portfolio/`;
const SITEMAP_URL = `${BASE_URL}/companies-sitemap.xml`;
const BATCH_SIZE = 5;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// the CMS post titles carry the site's own typos; fix the known ones, in
// both their post-title and slug-derived spellings
const TYPO_FIX: Record<string, string> = {
  "Qunatum Machines": "Quantum Machines",
  ScyallaDB: "ScyllaDB",
  Scyalldb: "ScyllaDB",
  Puresec: "PureSec",
  Carebestie: "CareBestie",
};

const STAGE_LABEL: Record<string, string> = {
  seed: "Seed",
  a: "Series A",
  b: "Series B",
  "series a": "Series A",
  "series b": "Series B",
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

// identity keys are compared with everything but letters and digits removed
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// a logo filename like "Next-White-1.svg" boils down to "next"
const logoKey = (url: string) =>
  norm(
    url
      .split("/")
      .pop()!
      .replace(/\.(svg|png|jpe?g|webp)$/i, "")
      .replace(/[-_ ]?(white|color|horizontal|logo|new)?[-_ ]?\d*$/i, ""),
  );

const levenshtein = (a: string, b: string): number => {
  if (Math.abs(a.length - b.length) > 2) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    }
    prev = cur;
  }
  return prev[b.length];
};

// the site rate-limits bursts of detail-page fetches with 429s, which pass
// after a few seconds of patience
async function fetchPage(url: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const resp = await fetch(url, { headers: { "User-Agent": UA } });
      if (!resp.ok) {
        const err = new Error(`Failed to fetch ${url}: ${resp.status}`);
        if (resp.status === 429 && attempt < 5) {
          lastError = err;
          await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
          continue;
        }
        throw err;
      }
      return await resp.text();
    } catch (err) {
      lastError = err;
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastError;
}

const titleFromSlug = (slug: string) =>
  slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

// the puzzle cards show logos only — the display names live on the company
// detail pages, one per sitemap entry, as the CMS post title. a lost page
// costs pretty casing, not the company — but since companies are identified
// by name, wide fallback would mint phantom duplicates, so it is counted
// and capped by the caller
async function nameOf(slug: string): Promise<{ name: string; fallback: boolean }> {
  let html: string;
  try {
    html = await fetchPage(`${BASE_URL}/companies/${slug}/`);
  } catch {
    return { name: TYPO_FIX[titleFromSlug(slug)] ?? titleFromSlug(slug), fallback: true };
  }
  const title = text(html.match(/<meta property="og:title" content="([^"]*)"/)?.[1] ?? "");
  if (!title) return { name: TYPO_FIX[titleFromSlug(slug)] ?? titleFromSlug(slug), fallback: true };
  return { name: TYPO_FIX[title] ?? title, fallback: false };
}

interface Card {
  domKey: string;
  whiteKey: string;
  url: string;
  category: string;
}

interface Entry {
  slug: string;
  name: string;
  keys: string[];
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const html = await fetchPage(PAGE_URL);

  const cards: Card[] = [];
  for (const chunk of html.split('<div class="tlv_company ').slice(1)) {
    const white = chunk.match(/data-bg="([^"]*)" class="tlv_logo_white_horizontal/)?.[1] ?? "";
    const url = chunk.match(/class="visit">Visit <a[^>]*href="([^"]*)"/)?.[1] ?? "";
    const sector = text(chunk.match(/Sector:\s*([^<]*)/)?.[1] ?? "");
    const stage = text(chunk.match(/Entry-stage:\s*([^<]*)/)?.[1] ?? "");
    const domain = url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];

    cards.push({
      domKey: domain ? norm(domain.split(".")[0]) : "",
      whiteKey: white ? logoKey(white) : "",
      url,
      category: [sector, STAGE_LABEL[stage.toLowerCase()] ?? stage].filter(Boolean).join(", "),
    });
  }
  if (cards.length === 0) {
    throw new Error("tlv: no company cards found on the portfolio page");
  }

  const sitemap = await fetchPage(SITEMAP_URL);
  const slugs = [...sitemap.matchAll(/<loc>https:\/\/www\.tlv\.partners\/companies\/([^/<]+)\/<\/loc>/g)].map(
    (m) => m[1],
  );
  if (slugs.length === 0) {
    throw new Error("tlv: the companies sitemap is empty — it moved");
  }

  const entries: Entry[] = [];
  let fallbacks = 0;
  for (let i = 0; i < slugs.length; i += BATCH_SIZE) {
    const batch = await Promise.all(
      slugs.slice(i, i + BATCH_SIZE).map(async (slug) => {
        const { name, fallback } = await nameOf(slug);
        if (fallback) fallbacks++;
        return { slug, name, keys: [] as string[] };
      }),
    );
    entries.push(...batch);
    if (i + BATCH_SIZE < slugs.length) {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  if (fallbacks > slugs.length * 0.1) {
    throw new Error(`tlv: ${fallbacks} of ${slugs.length} detail pages refused to yield a name`);
  }
  for (const entry of entries) entry.keys = [norm(entry.name), norm(entry.slug)];

  // the cards name nobody: match each card to its CMS post. domains are the
  // most truthful (logos suffer copy-paste bugs), logos cover the acquired
  // companies whose visit link points at the acquirer, and an edit-distance
  // pass absorbs the site's spelling drift
  const taken = new Set<string>();
  const matched = new Map<Card, Entry>();
  const claim = (card: Card, entry: Entry) => {
    taken.add(entry.slug);
    matched.set(card, entry);
  };

  for (const field of ["domKey", "whiteKey"] as const) {
    for (const card of cards) {
      if (matched.has(card) || !card[field]) continue;
      const hits = entries.filter((e) => !taken.has(e.slug) && e.keys.includes(card[field]));
      if (hits.length === 1) claim(card, hits[0]);
    }
  }
  for (const card of cards) {
    if (matched.has(card)) continue;
    for (const key of [card.domKey, card.whiteKey]) {
      if (!key) continue;
      const hits = entries.filter(
        (e) => !taken.has(e.slug) && e.keys.some((k) => k.startsWith(key) || key.startsWith(k)),
      );
      if (hits.length === 1) {
        claim(card, hits[0]);
        break;
      }
    }
  }
  for (const card of cards) {
    if (matched.has(card)) continue;
    let best: Entry | undefined;
    let bestDistance = 3;
    for (const entry of entries) {
      if (taken.has(entry.slug)) continue;
      for (const key of [card.whiteKey, card.domKey]) {
        for (const entryKey of entry.keys) {
          const d = levenshtein(key, entryKey);
          if (d < bestDistance) {
            best = entry;
            bestDistance = d;
          }
        }
      }
    }
    if (best) claim(card, best);
  }

  if (matched.size < cards.length * 0.8) {
    throw new Error(`tlv: only matched ${matched.size} of ${cards.length} cards to names — the matching broke`);
  }

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    const entry = matched.get(card);
    if (!entry) continue;
    const name = text(entry.name);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    companies.push({ name, category: card.category, url: card.url });
  }

  if (companies.length === 0) {
    throw new Error("tlv: no companies survived the matching");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("tlv: the sector and stage details moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("tlv: the visit links moved");
  }

  return companies;
}
