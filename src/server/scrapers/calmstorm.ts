import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.calmstorm.vc";
const PAGE_URL = `${BASE_URL}/portfolio`;
const BATCH_SIZE = 8;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// the same label reaches the company page in a longer form
const ALIASES: Record<string, string> = {
  "Clinical Decision Support": "Clinical Support",
  "Austrian Co-Founder": "Austrian Founder",
};

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
  return resp.text();
}

// the portfolio is one webflow tab set: a filter tab per label, plus an "All"
// tab that is the only one paginated
function panes(html: string) {
  const labels = new Map<string, string>();
  for (const link of html.matchAll(
    /<a data-w-tab="([^"]*)"[^>]*class="tab-link[^"]*"[^>]*>([\s\S]*?)<\/a>/g,
  )) {
    labels.set(link[1], text(link[2]));
  }

  const starts = [...html.matchAll(/<div data-w-tab="([^"]*)" class="tab w-tab-pane/g)];
  return starts.map((pane, i) => ({
    label: labels.get(pane[1]) ?? "",
    html: html.slice(pane.index ?? 0, starts[i + 1]?.index ?? html.length),
  }));
}

const slugsOf = (html: string) =>
  new Set([...html.matchAll(/href="\/portfolio\/([^"]+)"/g)].map((m) => m[1]));

async function detailOf(slug: string) {
  const html = await fetchPage(`${PAGE_URL}/${slug}`);
  return {
    tags: [...html.matchAll(/card-heading left-align tag">([\s\S]*?)<\/h5>/g)].map((m) => text(m[1])),
    url:
      html.match(
        /<a href="(https?:\/\/[^"]+)" target="_blank" class="button-2 _2-copy w-button">Visit Website<\/a>/,
      )?.[1] ?? "",
  };
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const first = await fetchPage(PAGE_URL);

  // every filter tab but "All" names a label the companies inside it carry
  const tags = new Map<string, string[]>();
  for (const pane of panes(first)) {
    if (!pane.label || pane.label === "All") continue;
    for (const slug of slugsOf(pane.html)) {
      tags.set(slug, [...(tags.get(slug) ?? []), pane.label]);
    }
  }
  if (tags.size === 0) {
    throw new Error("calmstorm: portfolio filter tabs not found — the page layout moved");
  }

  const param = first.match(/href="\?([a-z0-9]+_page)=2"/)?.[1] ?? "";
  const pages = Number(first.match(/Page \d+ of (\d+)/)?.[1] ?? 0);
  if (!param || !pages) {
    throw new Error("calmstorm: portfolio pagination not found — the page layout moved");
  }

  // the "All" tab is the roster; the names live there rather than on the
  // company pages, whose headings are left empty
  const names = new Map<string, string>();
  for (let page = 1; page <= pages; page++) {
    const html = page === 1 ? first : await fetchPage(`${PAGE_URL}?${param}=${page}`);
    const all = panes(html).find((pane) => pane.label === "All");
    if (!all) {
      throw new Error(`calmstorm: page ${page} of ${pages} has no "All" tab`);
    }
    for (const item of all.html.split('<div class="table-item">').slice(1)) {
      const slug = item.match(/href="\/portfolio\/([^"]+)"/)?.[1] ?? "";
      const name = text(item.match(/<p class="dsadadad[^"]*">([\s\S]*?)<\/p>/)?.[1] ?? "");
      if (slug && name && !names.has(slug)) names.set(slug, name);
    }
  }
  if (names.size === 0) {
    throw new Error("calmstorm: no companies found in the portfolio list");
  }
  // the filter tabs and the "All" tab are two views of one list, so between
  // them they say whether either was served short
  for (const slug of names.keys()) {
    if (!tags.has(slug)) {
      throw new Error(`calmstorm: ${slug} is listed but appears under no filter tab`);
    }
  }
  for (const slug of tags.keys()) {
    if (!names.has(slug)) {
      throw new Error(`calmstorm: ${slug} is filtered but missing from the full list`);
    }
  }

  const slugs = [...names.keys()];
  const details = new Map<string, { tags: string[]; url: string }>();
  for (let i = 0; i < slugs.length; i += BATCH_SIZE) {
    const batch = await Promise.all(
      slugs.slice(i, i + BATCH_SIZE).map(async (slug) => [slug, await detailOf(slug)] as const),
    );
    for (const [slug, detail] of batch) details.set(slug, detail);
  }

  return slugs.map((slug) => {
    const detail = details.get(slug) ?? { tags: [], url: "" };
    // "C/S 2" and "C/SA 1" are the funds a company sits in, not what it does
    const labels = [...(tags.get(slug) ?? []), ...detail.tags.filter((t) => !t.startsWith("C/S"))];
    const category: string[] = [];
    for (const raw of labels) {
      const label = ALIASES[raw] ?? raw;
      // "Other" is the bucket for everything the health labels miss, and the
      // company pages name what it actually is
      if (label === "Exit" || label === "Other" || category.includes(label)) continue;
      category.push(label);
    }
    if (labels.includes("Exit")) category.push("Exited");

    return { name: names.get(slug) ?? "", category: category.join(", "), url: detail.url };
  });
}
