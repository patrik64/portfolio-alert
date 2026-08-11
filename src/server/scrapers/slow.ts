import type { ScrapedCompany } from './types';

const URL = "https://slow.co/about/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function scrape(): Promise<ScrapedCompany[]> {
  // Fetch the about page HTML
  const resp = await fetch(URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${URL}: ${resp.status}`);
  }
  const html = await resp.text();

  // Parse portfolio companies from the HTML
  // The page has <h4> category headers followed by <p> blocks with
  // <b><a href="...">Name</a></b> Description<br /> entries
  const companies: ScrapedCompany[] = [];

  // Extract the portfolio section (starts after <h2 id="portfolio">)
  const portfolioStart = html.indexOf('id="portfolio"');
  if (portfolioStart === -1) {
    throw new Error("Could not find portfolio section");
  }
  const portfolioHtml = html.slice(portfolioStart);

  // Match each category section: <h4 id="...">Category</h4> followed by company entries
  const categoryPattern = /<h4[^>]*>([^<]+)<\/h4>\s*<p>([\s\S]*?)<\/p>/g;
  let categoryMatch;

  while ((categoryMatch = categoryPattern.exec(portfolioHtml)) !== null) {
    const category = categoryMatch[1];
    const block = categoryMatch[2];

    // Match each company: <b><a href="...">Name</a></b> or <b> <a href="...">Name</a> </b>
    const companyPattern = /<b>\s*<a\s+href="([^"]*)"[^>]*>([^<]+)<\/a>\s*<\/b>/g;
    let companyMatch;

    while ((companyMatch = companyPattern.exec(block)) !== null) {
      const url = companyMatch[1];
      const name = companyMatch[2].trim();
      companies.push({ name, category, url });
    }
  }

  return companies;
}
