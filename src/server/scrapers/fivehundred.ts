import type { ScrapedCompany } from './types';

const BASE_URL = "https://500.co";
// the portfolio page draws its table from this, in one go, and filters it in
// the browser
const LIST_URL = `${BASE_URL}/api/startups`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// a stage that says nothing about the company
const UNKNOWN_STAGE = new Set(["na", "active - unknown"]);
// the stages that mean 500 is out
const EXITS = new Set(["exited", "secondary sale"]);

interface Named {
  name?: string | null;
}

interface Startup {
  organization?: {
    name?: string | null;
    alternativeName?: string | null;
    businessName?: string | null;
    companyUrl?: string | null;
    countryOfOperation?: Named | null;
  } | null;
  businessModel?: Named | null;
  stage?: Named | null;
  industries?: Named[] | null;
  batches?: { brandName?: string | null }[] | null;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

// nearly every address is filed as a bare domain, and a couple of records hold
// a sentence or a postal address where one was meant to go
const website = (raw: string) => {
  const value = clean(raw);
  if (/^https?:\/\//i.test(value)) return value;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(value) ? `https://${value}` : "";
};

// countries are filed in mixed case ("UNITED STATES" beside "United States");
// this is how the site itself evens them out before showing them
const country = (s: string) =>
  s
    .split(" ")
    .map((word) => (word ? word[0] + word.slice(1).toLowerCase() : word))
    .join(" ");

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(LIST_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${LIST_URL}: ${resp.status}`);
  }
  const payload = (await resp.json()) as { res?: Startup[]; status?: number };
  const startups = payload.res;
  if (!Array.isArray(startups) || startups.length === 0) {
    throw new Error("500: the startups list came back empty");
  }

  const companies: ScrapedCompany[] = [];
  for (const startup of startups) {
    const org = startup.organization ?? {};
    // the table shows a company's brand rather than the name it is registered
    // under, and a record with neither is one the site itself leaves blank
    const name = clean(org.businessName || (org.alternativeName ?? "").split(";")[0] || "");
    if (!name) continue;

    const stage = clean(startup.stage?.name ?? "");
    const home = clean(org.countryOfOperation?.name ?? "");

    companies.push({
      name,
      category: [
        ...(startup.industries ?? []).map((industry) => clean(industry.name ?? "")),
        home ? country(home) : "",
        UNKNOWN_STAGE.has(stage.toLowerCase()) ? "" : stage,
        clean(startup.businessModel?.name ?? ""),
        ...(startup.batches ?? []).map((batch) => clean(batch.brandName ?? "")),
        // one of the stages already says it in as many words
        EXITS.has(stage.toLowerCase()) && !/^exited$/i.test(stage) ? "Exited" : "",
      ]
        .filter(Boolean)
        .join(", "),
      url: website(org.companyUrl ?? ""),
    });
  }

  if (companies.length === 0) {
    throw new Error("500: no companies had a name — the records moved");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("500: the startups' industries and stages moved");
  }

  return companies;
}
