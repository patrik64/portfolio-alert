import type { ScrapedCompany } from './types';

const BASE_URL = "https://headline.com";
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface RichText {
  text?: string;
}

interface CompanyDoc {
  uid?: string;
  data?: {
    page_title?: RichText[];
    link?: { url?: string };
    text_blocks?: { text?: RichText[] }[];
  };
}

// each block is a label followed by its values, either as separate paragraphs
// or as one paragraph with newlines
function fields(doc: CompanyDoc): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const block of doc.data?.text_blocks ?? []) {
    const lines = (block.text ?? [])
      .flatMap((p) => (p.text ?? "").split("\n"))
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    const label = lines[0].replace(/:$/, "").trim();
    if (!out.has(label)) out.set(label, lines.slice(1));
  }
  return out;
}

function valuesFor(f: Map<string, string[]>, prefix: string): string[] {
  for (const [label, values] of f) {
    if (label.toLowerCase().startsWith(prefix)) return values;
  }
  return [];
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  // the portfolio ships in the page's Next.js data payload
  const json = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  )?.[1];
  if (!json) {
    throw new Error("headline: __NEXT_DATA__ payload not found");
  }
  const data: { props?: { pageProps?: { companiesData?: CompanyDoc[] } } } = JSON.parse(json);
  const docs = data.props?.pageProps?.companiesData ?? [];
  if (docs.length === 0) {
    throw new Error("headline: no companies in the page payload");
  }

  const companies: ScrapedCompany[] = [];
  for (const doc of docs) {
    const name = doc.data?.page_title?.[0]?.text?.trim();
    if (!name) continue;

    const f = fields(doc);
    // the investment history records exits ("2023: Exit (acquired by Visa)")
    const exited = valuesFor(f, "strategy").some((v) => /exit/i.test(v));

    companies.push({
      name,
      category: [
        ...valuesFor(f, "sector"),
        ...valuesFor(f, "location"),
        exited ? "Exited" : "",
      ]
        .filter(Boolean)
        .join(", "),
      url: doc.data?.link?.url || (doc.uid ? `${PAGE_URL}/${doc.uid}` : ""),
    });
  }

  return companies;
}
