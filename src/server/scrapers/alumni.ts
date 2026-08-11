import type { ScrapedCompany } from './types';

const URL = "https://www.av.vc/portfolio";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function scrape(): Promise<ScrapedCompany[]> {
  // Fetch the portfolio page and extract __NEXT_DATA__
  const resp = await fetch(URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${URL}: ${resp.status}`);
  }
  const html = await resp.text();

  const dataMatch = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!dataMatch) {
    throw new Error("Could not find __NEXT_DATA__");
  }

  const nextData = JSON.parse(dataMatch[1]);
  const portfolioModule = nextData.props.pageProps.modules.find(
    (m: { type: string }) => m.type === "portfolio",
  );
  if (!portfolioModule) {
    throw new Error("Could not find portfolio module");
  }

  const rawCompanies = portfolioModule.data.portfolio.companies;
  const companies: ScrapedCompany[] = rawCompanies.map(
    (c: {
      name: string;
      info?: { url?: string };
      tags?: { sector?: { name?: string } };
    }) => ({
      name: c.name,
      category: c.tags?.sector?.name || "",
      url: c.info?.url || "",
    }),
  );

  return companies;
}
