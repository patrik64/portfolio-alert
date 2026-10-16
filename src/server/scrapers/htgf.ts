import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.htgf.de";
const PAGE_URL = `${BASE_URL}/en/portfolio/`;
const LIST_URL = `${BASE_URL}/wp-json/htgf/v1/mq_portfolio`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
// a refusal (429) is waited out once, for as long as the site asks within reason
const REFUSED_MS = 20_000;
const REFUSED_MAX_MS = 30_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// the grid is empty until the page asks for it, and the request it makes
// answers with every card at once (the page size raised to take the whole
// portfolio): a card a company with its name, the year the fund came in,
// its state, its status and its sectors — the broad one ("Agritech & Food")
// and the focus areas under it ("Agritech", "Food") — all as ids that the
// page's filter buttons spell out. the sectors, the state, the year and the
// status are kept as tags, an exit or a listing with the Exited tag.
//
// a company's own site is written only on its page here, and five hundred
// of those read at a run is what the site rate-limits with 429s. so the
// pages are read newest company first, one at a time with a pause, a
// refusal waited out once and a second one ending the reading, and none
// begun past the deadline: a company whose page was not read links its
// page here. the list itself must come whole.

// the filter row offers Active, Exit and IPO; the company pages show a fourth
const EXTRA_STATUSES: Record<string, string> = { semiexit: "Semi-Exit" };

const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#0?38;|&amp;/g, "&")
    .replace(/&#0?39;|&#8217;|&#x27;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&#8203;|&#x200b;|​/gi, "")
    .replace(/&nbsp;| /g, " ")
    .replace(/\s+/g, " ")
    .trim();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(url: string) {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return resp.text();
}

// how long a 429 asks to be waited out, within reason
const refusedFor = (resp: Response) => {
  const asked = Number(resp.headers.get("retry-after"));
  return asked > 0 ? Math.min(asked * 1000, REFUSED_MAX_MS) : REFUSED_MS;
};

// a company page's answer: its html, or the status it gave instead and, for
// a 429, how long it asks to be left alone
async function askPage(link: string): Promise<{ html: string; status: number; wait: number }> {
  try {
    const resp = await fetch(link, { headers: { "User-Agent": UA } });
    if (!resp.ok) {
      const wait = resp.status === 429 ? refusedFor(resp) : 0;
      await resp.body?.cancel();
      return { html: "", status: resp.status, wait };
    }
    return { html: await resp.text(), status: resp.status, wait: 0 };
  } catch {
    return { html: "", status: 0, wait: 0 };
  }
}

// the company's own site, written on its page under "company info"
function websiteIn(html: string) {
  const about = html.slice(html.indexOf('id="company-info"'));
  // a few of the links were typed with a space left on the end
  return (
    about
      .match(/<a href="(https?:\/\/[^"]+)" target="_blank" class="wp-block-button__link/)?.[1]
      ?.trim() ?? ""
  );
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const started = Date.now();
  const resp = await fetch(LIST_URL, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/json" },
    body: JSON.stringify({
      posts_per_page: 2000,
      offset: 0,
      lang: "en",
      searchterm: "",
      orderby: "date",
      order: "DESC",
      meta_key: "",
    }),
  });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${LIST_URL}: ${resp.status}`);
  }
  const listing: { html?: string; count?: number } = await resp.json();
  const grid = listing.html ?? "";
  if (!grid) {
    throw new Error("htgf: the portfolio request returned no companies");
  }

  // sectors, focus areas, german states and statuses all reach the cards as
  // ids, and the filter buttons are where each one is spelled out
  const labels = new Map<string, string>();
  for (const button of (await fetchPage(PAGE_URL)).matchAll(
    /<button([^>]*)>([\s\S]{0,200}?)<\/button>/g,
  )) {
    const id = button[1].match(/data-id="([^"]*)"/)?.[1];
    const label = text(button[2]);
    if (id && label && !labels.has(id)) labels.set(id, label);
  }
  if (labels.size === 0) {
    throw new Error("htgf: portfolio filters not found — the page layout moved");
  }

  interface Card {
    name: string;
    sectors: string[];
    state: string;
    year: string;
    statuses: string[];
    link: string;
  }
  const cards: Card[] = [];
  const seen = new Set<string>();

  for (const card of grid.split('<div class="htgf-card htgf-portfolio-card ').slice(1)) {
    const name = text(card.match(/htgf-portfolio-card__title">\s*<h3>([\s\S]*?)<\/h3>/)?.[1] ?? "");
    if (!name || seen.has(name)) continue;
    seen.add(name);

    // the broad sector first, then the focus areas under it; the attribute
    // the sectors come in has carried a year ("data-sectors25")
    const sectors: string[] = [];
    for (const attr of [/data-sectors?\d*="([^"]*)"/, /data-focus_area="([^"]*)"/]) {
      for (const id of (card.match(attr)?.[1] ?? "").split(",")) {
        const label = labels.get(id);
        if (label && !sectors.includes(label)) sectors.push(label);
      }
    }

    cards.push({
      name,
      sectors,
      state: labels.get(card.match(/data-location="([^"]*)"/)?.[1] ?? "") ?? "",
      year: card.match(/htgf-portfolio-card__date">\s*(\d{4})/)?.[1] ?? "",
      statuses: (card.match(/data-status="([^"]*)"/)?.[1] ?? "").split(",").filter(Boolean),
      link: card.match(/href="(https:\/\/www\.htgf\.de\/en\/portfolio\/[^"]+)"/)?.[1] ?? "",
    });
  }

  if (cards.length === 0) {
    throw new Error("htgf: no companies found in the portfolio grid");
  }
  // the endpoint says how many companies the query matched
  if (listing.count && cards.length < listing.count) {
    throw new Error(`htgf: read ${cards.length} of the ${listing.count} companies listed`);
  }

  // the sites, as far as the deadline and the site's patience allow: the
  // grid comes newest first, so the companies likeliest to be new are read
  // first. the site budgets a few dozen page reads before it answers 429,
  // and a wait buys one more at best — so the first refusal is waited out
  // once, and a second ends the reading for the night
  const websites = new Map<string, string>();
  let refusals = 0;
  for (const card of cards) {
    if (!card.link || Date.now() - started >= DEADLINE_MS) break;
    if (websites.size > 0) await sleep(PACE_MS);
    let answer = await askPage(card.link);
    if (answer.status === 429) {
      if (++refusals > 1) break;
      await sleep(answer.wait);
      answer = await askPage(card.link);
      if (answer.status === 429) break;
    }
    websites.set(card.name, websiteIn(answer.html));
  }

  return cards.map((card) => {
    // "active" is the default; the rest name how htgf came out of the company,
    // and a semi-exit is one it still holds a piece of
    const statuses = card.statuses.filter((status) => status !== "active");
    return {
      name: card.name,
      category: [
        ...card.sectors,
        card.state,
        card.year,
        ...statuses.map((status) => EXTRA_STATUSES[status] ?? labels.get(status) ?? status),
        statuses.some((status) => status === "exit" || status === "ipo") ? "Exited" : "",
      ]
        .filter(Boolean)
        .join(", "),
      url: websites.get(card.name) || card.link || PAGE_URL,
    };
  });
}
