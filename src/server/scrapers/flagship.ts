import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.flagshippioneering.com";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BATCH_SIZE = 20;

const STATUSES = ["current", "former"] as const;
const DOMAINS: [string, string][] = [
  ["human-health", "Human Health"],
  ["sustainability", "Sustainability"],
];

function parseGrid(html: string): { name: string; path: string }[] {
  return [
    ...html.matchAll(
      /<a href="(https:\/\/www\.flagshippioneering\.com\/companies\/[^"]+)" class="companies__grid-link" title="([^"]+)"/g,
    ),
  ].map((m) => ({ path: m[1], name: m[2].replace(/&amp;/g, "&").trim() }));
}

async function fetchList(params: string): Promise<{ name: string; path: string }[]> {
  const url = `${BASE_URL}/companies?${params}`;
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return parseGrid(await resp.text());
}

// each company's detail page links the company website from its logo
async function fetchWebsite(path: string): Promise<string> {
  try {
    const resp = await fetch(path, { headers: { "User-Agent": UA } });
    if (!resp.ok) return "";
    const html = await resp.text();
    return html.match(/<a href="(https?:\/\/[^"]+)"[^>]*class="company__logo-link"/)?.[1] ?? "";
  } catch {
    return "";
  }
}

export async function scrape(): Promise<ScrapedCompany[]> {
  interface Entry {
    name: string;
    path: string;
    domains: string[];
    historical: boolean;
  }
  const byPath = new Map<string, Entry>();

  // the grid shows current companies by default; former ones live behind the
  // status filter, and the domain filters supply each company's domain
  for (const status of STATUSES) {
    for (const entry of await fetchList(`status=${status}`)) {
      byPath.set(entry.path, { ...entry, domains: [], historical: status === "former" });
    }
    for (const [slug, label] of DOMAINS) {
      for (const entry of await fetchList(`status=${status}&domain=${slug}`)) {
        const existing = byPath.get(entry.path);
        if (existing && !existing.domains.includes(label)) existing.domains.push(label);
      }
    }
  }

  const entries = [...byPath.values()];

  const websiteByPath = new Map<string, string>();
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (e) => ({ path: e.path, website: await fetchWebsite(e.path) })),
    );
    for (const r of results) {
      websiteByPath.set(r.path, r.website);
    }
  }

  const companies: ScrapedCompany[] = entries.map((e) => ({
    name: e.name,
    category: [...e.domains, ...(e.historical ? ["Historical"] : [])].join(", "),
    url: websiteByPath.get(e.path) || e.path,
  }));

  return companies;
}
