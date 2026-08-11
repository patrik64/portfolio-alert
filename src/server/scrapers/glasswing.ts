import type { ScrapedCompany } from './types';

const BASE_URL = "https://glasswing.vc";
const API_URL = `${BASE_URL}/wp-json/wp/v2/portfolio`;
const PAGE_URL = `${BASE_URL}/our-companies/`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// thesis areas and stages carried as WP category slugs on each portfolio post
const CATEGORY_LABELS: [RegExp, string][] = [
  [/^category-connect/, "Connect"],
  [/^category-protect/, "Protect"],
  [/^category-core$/, "Core"],
  [/^category-pre-seed$/, "Pre-seed"],
];

const decode = (s: string) =>
  s
    .replace(/&amp;|&#038;/g, "&")
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, "–")
    .trim();

interface PortfolioPost {
  title: { rendered: string };
  class_list: string[];
}

export async function scrape(): Promise<ScrapedCompany[]> {
  // names + categories from the WP REST API (paginated, 100 per page)
  const posts: PortfolioPost[] = [];
  let page = 1;
  while (true) {
    const resp = await fetch(`${API_URL}?per_page=100&page=${page}`, {
      headers: { "User-Agent": UA },
    });
    if (resp.status === 400) break;
    if (!resp.ok) {
      throw new Error(`Failed to fetch ${API_URL} page ${page}: ${resp.status}`);
    }
    const data: PortfolioPost[] = await resp.json();
    if (data.length === 0) break;
    posts.push(...data);
    page++;
  }

  // company websites only appear in the modals on the our-companies page
  const pageResp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  const websiteByName = new Map<string, string>();
  if (pageResp.ok) {
    const html = await pageResp.text();
    for (const card of html.split('class="portfolio-card"').slice(1)) {
      const name = card.match(/<div class="name">([^<]+)<\/div>/)?.[1];
      const website = card.match(/<div class="website"><a href="([^"]+)"/)?.[1];
      if (name && website) websiteByName.set(decode(name), website);
    }
  }

  const companies: ScrapedCompany[] = posts.map((post) => {
    const name = decode(post.title.rendered);
    const labels = new Set<string>();
    for (const cls of post.class_list) {
      for (const [re, label] of CATEGORY_LABELS) {
        if (re.test(cls)) labels.add(label);
      }
    }
    return {
      name,
      category: [...labels].join(", "),
      url: websiteByName.get(name) ?? "",
    };
  });

  return companies;
}
