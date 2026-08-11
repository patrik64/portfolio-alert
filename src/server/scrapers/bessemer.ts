import type { ScrapedCompany } from './types';

const URL = "https://www.bvp.com/companies";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function scrape(): Promise<ScrapedCompany[]> {
  // Fetch the portfolio page HTML
  const resp = await fetch(URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${URL}: ${resp.status}`);
  }
  const html = await resp.text();

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
