import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.trianglepeakpartners.com";
// triangle peak keeps a page per strategy, and each lists its own investments
const LISTINGS = [
  { path: "/technology/", strategy: "Technology" },
  { path: "/energy/", strategy: "Energy" },
];
// the tag a company is filed under once triangle peak is out of it
const EXIT_TAG = "m-a-ipo";
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

// "energy-transition" -> "Energy Transition", for a tag no page names
const derive = (tag: string) =>
  tag
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

async function fetchPage(url: string) {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const pages = await Promise.all(LISTINGS.map((listing) => fetchPage(`${BASE_URL}${listing.path}`)));

  // the buttons above the grid are where the tags are written out in full, and
  // only one of the pages offers all of them
  const labels = new Map<string, string>();
  for (const page of pages) {
    for (const button of page.matchAll(/data-tag="([^"]*)"[^>]*>\s*([^<]+?)\s*<\/a>/g)) {
      const label = text(button[2]);
      if (button[1] && button[1] !== "all" && label) labels.set(button[1], label);
    }
  }

  // a company backed under both strategies is listed on both pages, tagged
  // differently on each, so what it is filed under is collected across them
  const found = new Map<string, { strategies: string[]; tags: string[]; url: string }>();
  for (const [i, page] of pages.entries()) {
    const strategy = LISTINGS[i].strategy;
    // each card is a logo wrapped in the link to the company
    for (const card of page.matchAll(
      /<a href="([^"]*)"[^>]*>\s*<div class="[^"]*paged-item portfolio-filter([^"]*)"[\s\S]*?<img[^>]*\salt="([^"]*)"/g,
    )) {
      const name = text(card[3]);
      if (!name) continue;

      const company = found.get(name) ?? { strategies: [], tags: [], url: "" };
      if (!company.strategies.includes(strategy)) company.strategies.push(strategy);
      for (const tag of card[2].split(/\s+/).filter(Boolean).map((t) => t.replace(/^portfolio-/, ""))) {
        if (!company.tags.includes(tag)) company.tags.push(tag);
      }
      const link = decode(card[1]).trim();
      if (!company.url && /^https?:\/\//i.test(link)) company.url = link;
      found.set(name, company);
    }
  }

  const companies = [...found].map(([name, company]) => ({
    name,
    category: [
      ...company.strategies,
      ...company.tags.filter((tag) => tag !== EXIT_TAG).map((tag) => labels.get(tag) ?? derive(tag)),
      company.tags.includes(EXIT_TAG) ? (labels.get(EXIT_TAG) ?? derive(EXIT_TAG)) : "",
      company.tags.includes(EXIT_TAG) ? "Exited" : "",
    ]
      .filter(Boolean)
      .join(", "),
    url: company.url,
  }));

  if (companies.length === 0) {
    throw new Error("triangle peak: no companies found in the portfolio");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("triangle peak: the companies' links moved");
  }
  if (!companies.some((company) => company.category.includes("Exited"))) {
    throw new Error("triangle peak: the tag marking a company it has left moved");
  }

  return companies;
}
