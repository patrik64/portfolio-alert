import type { ScrapedCompany } from './types';

const BASE_URL = "https://industrifonden.com";
const PAGE_URL = `${BASE_URL}/portfolio/`;
const COUNT_URL = `${BASE_URL}/wp-json/wp/v2/portfolio_company?per_page=1`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// the two states of the portfolio rather than anything a company does
const STATES = new Set(["active", "selected exits"]);

const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#0?38;|&amp;/g, "&")
    .replace(/&#0?39;|&#8217;|&#x27;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&nbsp;|\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  // the cards wear their categories as class names, and the filter buttons
  // above the grid are where those are spelled the way the site writes them
  const labels = new Map<string, string>();
  for (const button of html.matchAll(
    /data-filter="\.(portfolio-category-[a-z0-9-]+)"[^>]*><span>([\s\S]*?)<\/span>/g,
  )) {
    labels.set(button[1], text(button[2]));
  }
  if (labels.size === 0) {
    throw new Error("industrifonden: portfolio filters not found — the page layout moved");
  }

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();

  for (const card of html.matchAll(
    /<div id="post-\d+" class="item ([^"]*)"([\s\S]*?)(?=<div id="post-\d+" class="item |<footer|$)/g,
  )) {
    const classes = card[1].split(/\s+/);
    if (!classes.includes("portfolio_company")) continue;
    const item = card[2];

    // the logo is captioned with the company; the handful without one fall
    // back to a heading in its place
    const heading = item.match(/class="portfolio-item-content">([\s\S]*?)<\/div>/)?.[1] ?? "";
    const name =
      text(item.match(/<img alt="([^"]*)" class="lazy portfolio-logo"/)?.[1] ?? "") ||
      text(heading.match(/<h2>([\s\S]*?)<\/h2>/)?.[1] ?? "");
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const categories = classes
      .filter((c) => c.startsWith("portfolio-category-"))
      .map((c) => labels.get(c) ?? c);
    const exited = categories.some((c) => c.toLowerCase() === "selected exits");
    // the pre-seed badge is printed on every card but only shown on these
    const preSeed = /class="portfolio-item item-inner [^"]*\bhas-preseed\b/.test(item);
    // the other button on a card points at the industrifonden partner who
    // covers the company, not at the company
    const url =
      [...item.matchAll(/<a role="button" class="link-button" href="([^"]+)"/g)]
        .map((m) => m[1])
        .find((href) => !href.startsWith(BASE_URL)) ?? "";

    companies.push({
      name,
      category: [
        ...categories.filter((c) => !STATES.has(c.toLowerCase())),
        preSeed ? "Pre-seed" : "",
        exited ? "Exited" : "",
      ]
        .filter(Boolean)
        .join(", "),
      url,
    });
  }

  if (companies.length === 0) {
    throw new Error("industrifonden: no companies found in the portfolio grid");
  }

  // wordpress counts the portfolio for itself
  const countResp = await fetch(COUNT_URL, { headers: { "User-Agent": UA } });
  const total = Number(countResp.headers.get("x-wp-total") ?? 0);
  if (total > 0 && companies.length < total * 0.95) {
    throw new Error(
      `industrifonden: only ${companies.length} of ${total} portfolio companies were read`,
    );
  }

  return companies;
}
