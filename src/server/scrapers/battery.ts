import type { ScrapedCompany } from './types';

const PAGE_URL = "https://www.battery.com/list-of-all-companies/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function scrape(): Promise<ScrapedCompany[]> {
  // Fetch the companies page — all companies are listed as <p> tags
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  // Extract company names from <p> tags
  // Companies follow the intro paragraphs and end before "* Denotes"
  const entries = [...html.matchAll(/<p>([\s\S]{2,200}?)<\/p>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, "").trim(),
  );

  const companies: ScrapedCompany[] = [];
  for (const entry of entries) {
    // Skip intro text, footer notes, and cookie text
    if (entry.length > 100) continue; // prose paragraphs, not company names
    if (entry.includes("Battery has invested")) continue;
    if (entry.includes("investment staff")) continue;
    if (entry.startsWith("* Denotes")) continue;
    if (entry.includes("cookies")) continue;
    if (entry.includes("browsing experience")) continue;
    if (entry.includes("categorized")) continue;
    if (entry.includes("classified")) continue;

    // Determine if exited (marked with *)
    const exited = entry.endsWith("*");
    const name = entry.replace(/\s*\*\s*$/, "").trim();
    if (!name) continue;

    const category = exited ? "Exited" : "";
    companies.push({ name, category, url: "" });
  }

  return companies;
}
