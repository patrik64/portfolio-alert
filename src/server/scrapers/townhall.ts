import type { ScrapedCompany } from './types';

const PAGE_URL = "https://www.townhallventures.com/portfolio";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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
  const companies: ScrapedCompany[] = [];
  const items = html.split("gallery-grid-item has-clickthrough").slice(1);

  for (const item of items) {
    const slugMatch = item.match(/href="#lightbox>([^"]+)"/);
    const slug = slugMatch?.[1] || "";
    if (!slug) continue;

    // Convert slug to proper name
    const name = slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    // Extract tags from hidden span — status ("Current"/"Exited") and stage
    // ("Venture"/"Growth"); "Current" is the default state and carries no signal
    const tagsMatch = item.match(/<span class="tags"[^>]*>([^<]+)<\/span>/);
    const category = (tagsMatch?.[1] ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t && t !== "Current")
      .join(", ");

    companies.push({ name, category, url: "" });
  }

  return companies;
}
