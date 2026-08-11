import type { ScrapedCompany } from './types';

const BASE_URL = "https://polarispartners.com";
const PAGE_URL = `${BASE_URL}/portfolio/`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BATCH_SIZE = 12;
const BATCH_DELAY_MS = 250;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// each card's modal is served by the theme's REST route and carries the
// company website and exit information
async function fetchModal(id: string, attempt = 1): Promise<{ website: string; exit: string }> {
  try {
    const resp = await fetch(`${BASE_URL}/wp-json/polaris/v1/portfolio/${id}`, {
      headers: { "User-Agent": UA },
    });
    if (!resp.ok) throw new Error(`${resp.status}`);
    const html: string = await resp.json();
    return {
      website: html.match(/class=\\?"modal-website\\?">\s*<a href=\\?"([^"\\]+)/)?.[1] ?? "",
      exit:
        html
          .match(/class=\\?"modal-exit\\?">([^<]+)</)?.[1]
          ?.replace(/&amp;/g, "&")
          .trim() ?? "",
    };
  } catch {
    if (attempt < 3) {
      await sleep(1000 * attempt);
      return fetchModal(id, attempt + 1);
    }
    return { website: "", exit: "" };
  }
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  interface Entry {
    name: string;
    id: string;
    sectors: string[];
  }
  const entries: Entry[] = [];
  for (const m of html.matchAll(
    /<a class="single-company element-item ([a-z\- ]*?) *company-(\d+)" data-title="([^"]+)"/g,
  )) {
    const sectors = m[1]
      .split(/\s+/)
      .filter(Boolean)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
    entries.push({ name: m[3].replace(/&amp;/g, "&").trim(), id: m[2], sectors });
  }

  const modalById = new Map<string, { website: string; exit: string }>();
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (e) => ({ id: e.id, modal: await fetchModal(e.id) })),
    );
    for (const r of results) {
      modalById.set(r.id, r.modal);
    }
    await sleep(BATCH_DELAY_MS);
  }

  const companies: ScrapedCompany[] = entries.map((e) => {
    const modal = modalById.get(e.id) ?? { website: "", exit: "" };
    return {
      name: e.name,
      category: [...e.sectors, modal.exit].filter(Boolean).join(", "),
      url: modal.website,
    };
  });

  return companies;
}
