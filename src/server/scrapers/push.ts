import type { ScrapedCompany } from './types';

const BASE_URL = "https://push.vc";
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface RichText {
  content?: { content?: { content?: { text?: string }[] }[] };
}

interface Item {
  tag?: string | string[] | null;
  year?: string | number | null;
  country?: string | null;
  display_name?: string | null;
  description?: RichText[] | null;
  link?: { link?: { url?: string | null } | null }[] | null;
}

interface Block {
  component?: string;
  items?: Item[];
}

const clean = (s: string) => s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

async function fetchPage(url: string) {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return resp.text();
}

// a company's write-up is stored as rich text, a paragraph at a time
function paragraphs(description: RichText[] | null | undefined) {
  const out: string[] = [];
  for (const block of description ?? []) {
    for (const node of block.content?.content ?? []) {
      const line = clean((node.content ?? []).map((part) => part.text ?? "").join(""));
      if (line) out.push(line);
    }
  }
  return out;
}

// push leaves the name off a few of its companies, and the write-up of each of
// those opens with the company saying what it is
const named = (blurb: string) =>
  clean(blurb.match(/^(.{1,40}?)\s+(?:is|are|was|were|offers|provides|develops|builds|helps|makes)\b/)?.[1] ?? "");

export async function scrape(): Promise<ScrapedCompany[]> {
  const html = await fetchPage(PAGE_URL);

  const raw = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  )?.[1];
  if (!raw) {
    throw new Error("push: the portfolio page carried no data");
  }

  const data = JSON.parse(raw) as {
    props?: { pageProps?: { content?: { content?: { content?: Block[] } } } };
  };
  const blocks = data.props?.pageProps?.content?.content?.content ?? [];
  const items = blocks.find((block) => Array.isArray(block.items) && block.items.length > 0)?.items ?? [];
  if (items.length === 0) {
    throw new Error("push: no companies found in the portfolio");
  }

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const blurbs = paragraphs(item.description);
    const name = clean(item.display_name ?? "") || named(blurbs[0] ?? "");
    if (!name || seen.has(name)) continue;
    seen.add(name);

    // push writes an exit into the write-up rather than filing it as a fact
    const exit = blurbs.find((line) => /^exit\b/i.test(line)) ?? "";
    const tags = Array.isArray(item.tag) ? item.tag : item.tag ? [item.tag] : [];

    companies.push({
      name,
      category: [
        ...tags.map((tag) => clean(tag)),
        clean(item.country ?? ""),
        clean(String(item.year ?? "")),
        clean(exit),
        exit ? "Exited" : "",
      ]
        .filter(Boolean)
        .join(", "),
      url: clean(item.link?.[0]?.link?.url ?? ""),
    });
  }

  if (companies.length < items.length * 0.9) {
    throw new Error(`push: named ${companies.length} of the ${items.length} companies listed`);
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("push: the companies' tags and years moved");
  }

  return companies;
}
