import type { ScrapedCompany } from './types';

const BASE_URL = "https://blume.vc";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// cloudflare sits in front of blume and scores requests; the fuller the
// browser disguise, the better the odds it lets a plain fetch through
const HEADERS = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"macOS"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

// blume publishes its portfolio as two lists that share no companies: the main
// one, and the small-cheque Discovery programme it runs alongside
const LISTINGS = [
  { path: "/startups", programme: "" },
  { path: "/discovery", programme: "Discovery" },
];

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

// the site rate-limits hard, so nothing here is fetched in parallel
async function fetchPage(url: string) {
  const resp = await fetch(url, { headers: HEADERS });
  // when cloudflare turns the request away anyway, say so — the block is on
  // where the request comes from, and the scrape runs fine from a laptop
  if (resp.status === 403) {
    throw new Error(
      "blume: refused this request (403) — cloudflare blocks fetches from datacenter addresses",
    );
  }
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return resp.text();
}

interface Entry {
  name: string;
  sectors: string[];
  status: string;
  location: string;
  programme: string;
  url: string;
}

function parseListing(
  html: string,
  listing: { path: string; programme: string },
  entries: Map<string, Entry>,
) {
  // the list is grouped into sections, each headed by a sector; a company that
  // spans sectors is rendered once per section
  const headings = [
    ...html.matchAll(/<span\s+id="[a-z0-9-]+"><\/span><span\s+class="break-words">([\s\S]*?)<a/g),
  ].map((m) => ({ at: m.index ?? 0, label: text(m[1]) }));

  const cards = [
    ...html.matchAll(/<div\s+id="([a-z0-9][a-z0-9-]*)"\s+class="[^"]*scroll-mt-16[^"]*"/g),
  ];
  // a card runs until whatever comes next — the following card, the next
  // section, or the end of the list
  const bounds = [
    ...cards.map((m) => m.index ?? 0),
    ...headings.map((h) => h.at),
    ...[...html.matchAll(/<\/section>/g)].map((m) => m.index ?? 0),
    html.length,
  ].sort((a, b) => a - b);

  for (const card of cards) {
    const start = card.index ?? 0;
    const item = html.slice(start, bounds.find((b) => b > start) ?? html.length);

    // the logo's alt text is whatever the file was called, so the name is read
    // from the term the page's own search highlights
    const name = text(item.match(/data-highlight-term="([^"]*)"/)?.[1] ?? "");
    if (!name) continue;

    const fields = new Map<string, string>();
    for (const field of item.matchAll(
      /<dt\s+class="sr-only">\s*([^<]+?)\s*<\/dt>([\s\S]*?)(?=<dt\s+class="sr-only">|<\/dl>)/g,
    )) {
      fields.set(
        text(field[1]),
        text(field[2].match(/<span\s+class="leading-tight">([\s\S]*?)<\/span>/)?.[1] ?? ""),
      );
    }

    // the startups cards link to blume's own profile page; the Discovery ones
    // aren't linked at all, but about half name the company's site inside the
    // blurb, and blume redirects the rest to an anchor on the list
    const blurb =
      item.match(/data-highlight-term="[^"]*"><div\s+class="[^"]*richtext[^"]*">([\s\S]*?)<\/div>/)?.[1] ??
      "";
    const url =
      blurb.match(/<a\s+href="(https?:\/\/[^"]+)"[^>]*target="_blank"/)?.[1] ??
      item.match(/<a\s+class="self-start[^"]*"\s+href="(https?:\/\/[^"]+)"/)?.[1] ??
      `${BASE_URL}${listing.path}#${card[1]}`;

    const sector = headings.filter((heading) => heading.at < start).pop()?.label ?? "";
    const entry = entries.get(name) ?? {
      name,
      sectors: [],
      status: fields.get("Investment Status") ?? "",
      location: fields.get("Locations") ?? "",
      programme: listing.programme,
      url,
    };
    if (sector && !entry.sectors.includes(sector)) entry.sectors.push(sector);
    entries.set(name, entry);
  }

  return cards.length;
}

// the sitemap is the only place blume says how many companies it has; pages
// stay published after a company drops off the lists, so it's an upper bound
async function publishedCount() {
  const index = await fetchPage(`${BASE_URL}/sitemap.xml`);
  const files = [...index.matchAll(/<loc>([^<]*sitemap-startups[^<]*)<\/loc>/g)].map((m) => m[1]);
  let count = 0;
  for (const file of files) {
    count += [...(await fetchPage(file)).matchAll(/<loc>/g)].length;
  }
  return count;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const entries = new Map<string, Entry>();

  for (const listing of LISTINGS) {
    const cards = parseListing(await fetchPage(`${BASE_URL}${listing.path}`), listing, entries);
    if (cards === 0) {
      throw new Error(`blume: no companies found on ${listing.path}`);
    }
  }

  const companies: ScrapedCompany[] = [];
  for (const entry of entries.values()) {
    // "Active" is the default and says nothing; the rest name the exit, in
    // wording too varied to leave the app's own word off
    const status = entry.status === "Active" ? "" : entry.status;
    companies.push({
      name: entry.name,
      category: [
        ...entry.sectors,
        entry.location,
        status,
        status && !/exited/i.test(status) ? "Exited" : "",
        entry.programme,
      ]
        .filter(Boolean)
        .join(", "),
      url: entry.url,
    });
  }

  if (!companies.some((company) => company.category)) {
    throw new Error("blume: portfolio sectors not found — the card markup moved");
  }

  const published = await publishedCount();
  if (published > 0 && companies.length < published * 0.75) {
    throw new Error(
      `blume: ${companies.length} companies listed but ${published} pages are published`,
    );
  }

  return companies;
}
