import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.bvp.com";
const URL = `${BASE_URL}/companies`;
const SITEMAP_URL = `${BASE_URL}/sitemap.xml`;
const BATCH_SIZE = 20;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// the companies grid is the first choice: every company in one page, with
// its roadmap tags and its own address. its server render broke in
// september 2026 — a bare 500 for everyone, days on end — so when it will
// not answer, the sitemap's page per company stands in: each page embeds
// the company's record (name, website, sectors) in its flight payload, and
// the names match the grid's spelling, so nothing is announced twice.

interface Sector {
  label?: string;
}

interface Record {
  name?: string;
  website?: string | null;
  sectors?: Sector[];
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

async function fetchText(url: string) {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return resp.text();
}

function fromGrid(html: string) {
  // Each company is in an <article> containing:
  //   - Summary: <div class="company"> with name and roadmap tags
  //   - Details: <div class="details company ..."> with website link
  // We match each article block from class="company"> to the closing </article>
  const companies: ScrapedCompany[] = [];
  const articlePattern =
    /class="company">\s*<h3[^>]*><a[^>]*class="name click-to-open">([^<]+)<\/a><\/h3>[\s\S]*?<div class="main-meta">([\s\S]*?)<\/div>\s*<\/div>\s*<div class="details company[\s\S]*?<\/article>/g;
  let match;

  while ((match = articlePattern.exec(html)) !== null) {
    const name = match[1].trim();
    const block = match[0];

    // Extract roadmap/category tags from main-meta
    const roadmaps = [...match[2].matchAll(/<a class="roadmap"[^>]*>([^<]+)<\/a>/g)];
    const category = roadmaps.map((m) => m[1].trim()).join(", ");

    // Extract website URL from the details section
    const urlMatch = block.match(
      /<a class="cta button white" href="([^"]+)"[^>]*target="_blank"/,
    );
    const url = urlMatch?.[1] || "";

    companies.push({ name, category, url });
  }

  return companies;
}

// the record sits inside a flight string literal, quotes escaped, so the
// page is unescaped and the object holding the website is read from its
// opening brace to the matching close
const unescaped = (html: string) => html.replace(/\\"/g, '"').replace(/\\\\/g, "\\");

function recordIn(text: string): Record | undefined {
  const at = text.indexOf(',"website":');
  if (at < 0) return undefined;
  const start = text.lastIndexOf('{"_id":', at);
  if (start < 0) return undefined;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (escaped) {
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === '"') {
      inString = !inString;
    } else if (!inString) {
      if (char === "{") depth++;
      else if (char === "}" && --depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as Record;
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

async function fromPages(): Promise<ScrapedCompany[]> {
  const sitemap = await fetchText(SITEMAP_URL);
  const slugs = [...sitemap.matchAll(/<loc>https:\/\/www\.bvp\.com\/portfolio\/([^<]+)<\/loc>/g)].map(
    (m) => m[1],
  );
  if (slugs.length === 0) {
    throw new Error("bessemer: the grid is down and the sitemap lists no companies");
  }

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < slugs.length; i += BATCH_SIZE) {
    const batch = await Promise.all(
      slugs.slice(i, i + BATCH_SIZE).map(async (slug) => {
        try {
          const page = await fetchText(`${BASE_URL}/portfolio/${slug}`);
          const record = recordIn(unescaped(page));
          const name = clean(record?.name ?? page.match(/<title[^>]*>([^<|]*)\|/)?.[1] ?? "");
          return name ? { name, record } : undefined;
        } catch {
          return undefined;
        }
      }),
    );
    for (const hit of batch) {
      if (!hit || seen.has(hit.name.toLowerCase())) continue;
      seen.add(hit.name.toLowerCase());
      companies.push({
        name: hit.name,
        category: (hit.record?.sectors ?? [])
          .map((s) => clean(s.label ?? ""))
          .filter(Boolean)
          .join(", "),
        url: hit.record?.website ?? "",
      });
    }
  }

  if (companies.length === 0) {
    throw new Error("bessemer: the grid is down and no company page could be read");
  }
  return companies;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(URL, { headers: { "User-Agent": UA } });
  if (resp.ok) {
    const companies = fromGrid(await resp.text());
    if (companies.length > 0) return companies;
  }
  return fromPages();
}
