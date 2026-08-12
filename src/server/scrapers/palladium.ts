import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.palladiumequity.com";
const PAGE_URL = `${BASE_URL}/investments`;
const REST_URL = `${BASE_URL}/wp-json/wp/v2/company?per_page=100`;
const MAX_PAGES = 20;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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

async function fetchPage(url: string) {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return { html: await resp.text(), headers: resp.headers };
}

// the filter dropdowns are where the taxonomy slugs on each company are
// spelled the way palladium writes them
function optionLabels(html: string, select: string) {
  const labels = new Map<string, string>();
  const block = html.match(new RegExp(`<select id="${select}"[\\s\\S]*?</select>`))?.[0] ?? "";
  for (const option of block.matchAll(/<option value="([^"]+)"[^>]*>([\s\S]*?)<\/option>/g)) {
    labels.set(option[1], text(option[2]));
  }
  return labels;
}

interface Panel {
  location: string;
  url: string;
}

// each card is followed by the panel it opens, which is the only place the
// company's home town and website appear
function parsePanels(html: string, panels: Map<string, Panel>) {
  for (const panel of html.matchAll(
    /<div id="([a-z0-9-]+)-panel" class="expandable-panel">([\s\S]*?)(?=<div id="[a-z0-9-]+-panel" class="expandable-panel">|<nav class="pagination|$)/g,
  )) {
    if (panels.has(panel[1])) continue;
    panels.set(panel[1], {
      location: text(panel[2].match(/<strong>([\s\S]*?)<\/strong>/)?.[1] ?? ""),
      url: panel[2].match(/<a href="(https?:\/\/[^"]+)" class="cta"/)?.[1] ?? "",
    });
  }
  return (html.match(/<article class="company-card/g) ?? []).length;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  // wordpress hands over the whole roster with the taxonomies attached, which
  // the page itself only ever applies through its filter script
  const rest = await fetchPage(REST_URL);
  const entries: { slug: string; title: { rendered: string }; class_list: string[] }[] = JSON.parse(
    rest.html,
  );
  if (entries.length === 0) {
    throw new Error("palladium: the company list came back empty");
  }
  const total = Number(rest.headers.get("x-wp-total") ?? 0);
  if (total > 0 && entries.length < total * 0.95) {
    throw new Error(`palladium: only ${entries.length} of ${total} companies were read`);
  }

  const first = await fetchPage(PAGE_URL);
  const sectors = optionLabels(first.html, "sector");
  const statuses = optionLabels(first.html, "company_status");

  // every page renders the same pagination as the first one and re-draws it in
  // the browser, so only the first one's page numbers can be believed
  const nav = first.html.match(/<nav class="pagination"[\s\S]*?<\/nav>/)?.[0] ?? "";
  const pages = Math.max(
    ...[...nav.matchAll(/ajax_page=(\d+)/g)].map((m) => Number(m[1])),
    1,
  );
  if (pages > MAX_PAGES) {
    throw new Error(`palladium: the portfolio claims ${pages} pages`);
  }

  const panels = new Map<string, Panel>();
  let cards = parsePanels(first.html, panels);
  for (let page = 2; page <= pages; page++) {
    const more = await fetchPage(`${PAGE_URL}?ajax_page=${page}`);
    const found = parsePanels(more.html, panels);
    if (found === 0) {
      throw new Error(`palladium: page ${page} of ${pages} showed no companies`);
    }
    cards += found;
  }
  // the grid and wordpress are two views of one list
  if (cards < entries.length * 0.95) {
    throw new Error(`palladium: the grid showed ${cards} of ${entries.length} companies`);
  }

  return entries.map((entry) => {
    // the taxonomy terms ride along on the class list: "sector-consumer",
    // "company_status-realized", plus the fund and strategy holding it
    const terms = (taxonomy: string) =>
      entry.class_list
        .filter((name) => name.startsWith(`${taxonomy}-`))
        .map((name) => name.slice(taxonomy.length + 1));
    const status = terms("company_status")[0] ?? "";
    const panel = panels.get(entry.slug);

    return {
      name: text(entry.title.rendered),
      category: [
        ...terms("sector").map((term) => sectors.get(term) ?? term),
        panel?.location ?? "",
        // "unrealized" is a company palladium still holds
        status === "realized" ? (statuses.get(status) ?? "Realized") : "",
        status === "realized" ? "Exited" : "",
      ]
        .filter(Boolean)
        .join(", "),
      url: panel?.url ?? "",
    };
  });
}
