import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.townhallventures.com";
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BATCH_SIZE = 8;
const BATCH_DELAY_MS = 250;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// the gallery links to /<slug>, a page carrying the company's full name and
// its website ("View Website" button)
async function fetchDetail(
  slug: string,
  attempt = 1,
): Promise<{ name: string; website: string }> {
  try {
    const resp = await fetch(`${BASE_URL}/${slug}`, { headers: { "User-Agent": UA } });
    if (!resp.ok) throw new Error(`${resp.status}`);
    const html = await resp.text();
    // "<company> &mdash; Town Hall Ventures"
    const name =
      html
        .match(/<title>([^<]*)<\/title>/)?.[1]
        ?.split(/&mdash;|—/)[0]
        .trim() ?? "";
    const website =
      html.match(/<a\s[^>]*href="(https?:\/\/[^"]+)"[^>]*>\s*View Website\s*<\/a>/)?.[1] ?? "";
    return { name, website };
  } catch {
    if (attempt < 3) {
      await sleep(1000 * attempt);
      return fetchDetail(slug, attempt + 1);
    }
    return { name: "", website: "" };
  }
}

export async function scrape(): Promise<ScrapedCompany[]> {
  // Fetch the Squarespace portfolio page — companies are in a gallery grid
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  // Each company is a gallery-grid-item with:
  //   href="#lightbox>slug" for the company slug
  //   <span class="tags" hidden>Status, Stage</span> for tags
  interface Entry {
    slug: string;
    category: string;
  }
  const entries: Entry[] = [];
  const items = html.split("gallery-grid-item has-clickthrough").slice(1);

  for (const item of items) {
    const slugMatch = item.match(/href="#lightbox>([^"]+)"/);
    const slug = slugMatch?.[1] || "";
    if (!slug) continue;

    // Extract tags from hidden span — status ("Current"/"Exited") and stage
    // ("Venture"/"Growth"); "Current" is the default state and carries no signal
    const tagsMatch = item.match(/<span class="tags"[^>]*>([^<]+)<\/span>/);
    const category = (tagsMatch?.[1] ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t && t !== "Current")
      .join(", ");

    entries.push({ slug, category });
  }

  const companies: ScrapedCompany[] = [];
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (entry) => {
        const detail = await fetchDetail(entry.slug);
        // fall back to the slug when the detail page can't be read
        const name =
          detail.name ||
          entry.slug
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");
        return { name, category: entry.category, url: detail.website };
      }),
    );
    companies.push(...results);
    await sleep(BATCH_DELAY_MS);
  }

  return companies;
}
