import type { ScrapedCompany } from './types';

const PAGE_URL = "https://www.kimaventures.com/portfolio";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface Company {
  name?: string;
  url?: string;
  sector?: { name?: string }[] | null;
  country?: { name?: string } | null;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  // the whole portfolio ships in the page's Next.js data payload
  const json = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  )?.[1];
  if (!json) {
    throw new Error("kima: __NEXT_DATA__ payload not found");
  }

  const data: { props?: { pageProps?: { companies?: Company[] } } } = JSON.parse(json);
  const list = data.props?.pageProps?.companies ?? [];
  if (list.length === 0) {
    throw new Error("kima: no companies in the page payload");
  }

  const companies: ScrapedCompany[] = list
    .filter((c) => c.name)
    .map((c) => ({
      name: c.name!.trim(),
      category: [
        ...(c.sector ?? []).map((s) => s.name).filter(Boolean),
        c.country?.name,
      ]
        .filter(Boolean)
        .join(", "),
      url: c.url ?? "",
    }));

  return companies;
}
