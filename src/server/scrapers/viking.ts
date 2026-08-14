import type { ScrapedCompany } from './types';

const BASE_URL = "https://vikingglobal.com";
const PAGE_URL = `${BASE_URL}/private-equity-portfolio/`;
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#0?38;|&amp;/g, "&")
    .replace(/&#0?39;|&#8217;|&#x27;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&#8203;|&#x200b;|\u200b/gi, "")
    .replace(/&nbsp;| /g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function fetchPage(url: string) {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return resp.text();
}

// the gallery holds a panel per company: its name, what viking says it does,
// and a two-column table of the facts
function namesOf(html: string) {
  return [...html.matchAll(/<h3 class="image-title">([\s\S]*?)<\/h3>/g)]
    .map((m) => text(m[1]))
    .filter(Boolean);
}

// the page filters itself by asking wordpress for the companies under a term
async function companiesUnder(termId: string) {
  const resp = await fetch(AJAX_URL, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: new URLSearchParams({ action: "portfolio_companies", theme_tags: termId }),
  });
  if (!resp.ok) {
    throw new Error(`Failed to fetch viking's ${termId} companies: ${resp.status}`);
  }
  const payload = (await resp.json()) as { lightbox_list?: string };
  return namesOf(payload.lightbox_list ?? "");
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const html = await fetchPage(PAGE_URL);

  const panels = html.split('<div class="image-lightbox"').slice(1);
  const companies = new Map<string, { status: string; year: string }>();
  for (const panel of panels) {
    const name = text(panel.match(/<h3 class="image-title">([\s\S]*?)<\/h3>/)?.[1] ?? "");
    if (!name || companies.has(name)) continue;

    // the facts are a table of headings above their values, so each value is
    // read from the heading that sits over it
    const headings = [...panel.matchAll(/<th>([\s\S]*?)<\/th>/g)].map((m) => text(m[1]));
    const values = [...panel.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((m) => text(m[1]));
    const fact = (heading: string) => values[headings.indexOf(heading)] ?? "";

    companies.set(name, { status: fact("Investment status"), year: fact("Year invested") });
  }

  if (companies.size === 0) {
    throw new Error("viking: no companies found in the portfolio gallery");
  }

  // the sectors are a filter rather than something the panels carry, so each
  // one is asked for its companies
  const terms = [
    ...(html.match(/<ul class="theme_tags_list">([\s\S]*?)<\/ul>/)?.[1] ?? "").matchAll(
      /<a href="#" id="(\d+)\s*">([\s\S]*?)<\/a>/g,
    ),
  ].map((m) => ({ id: m[1], label: text(m[2]) }));
  if (terms.length === 0) {
    throw new Error("viking: the portfolio's sector filter moved");
  }

  const sectors = new Map<string, string[]>();
  for (const term of terms) {
    for (const name of await companiesUnder(term.id)) {
      // viking files a handful of companies under more than one sector
      if (!companies.has(name)) {
        throw new Error(`viking: ${name} is filed under ${term.label} but missing from the gallery`);
      }
      sectors.set(name, [...(sectors.get(name) ?? []), term.label]);
    }
  }
  if (sectors.size === 0) {
    throw new Error("viking: no company came back under any sector");
  }

  return [...companies].map(([name, company]) => ({
    name,
    // "Active" is a company viking still holds
    category: [
      ...(sectors.get(name) ?? []),
      company.year,
      company.status === "Active" ? "" : company.status,
      company.status && company.status !== "Active" ? "Exited" : "",
    ]
      .filter(Boolean)
      .join(", "),
    // viking names its companies without linking to them
    url: "",
  }));
}
