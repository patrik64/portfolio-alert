import type { ScrapedCompany } from './types';

const BASE_URL = "https://jobs.kleinerperkins.com";
const PAGE_URL = `${BASE_URL}/companies`;
const API_URL = `${BASE_URL}/api-boards/search-companies`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface Company {
  name: string;
  website?: { url?: string };
  markets?: string[];
}

export async function scrape(): Promise<ScrapedCompany[]> {
  // The job board guards its API with a double-submit CSRF check: the page
  // sets a session cookie holding the secret and embeds the matching token,
  // and the API rejects a request carrying only one of the two.
  const pageResp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!pageResp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${pageResp.status}`);
  }
  const setCookie: string[] =
    typeof pageResp.headers.getSetCookie === "function"
      ? pageResp.headers.getSetCookie()
      : [pageResp.headers.get("set-cookie") ?? ""].filter(Boolean);
  const cookie = setCookie
    .map((c) => c.split(";")[0])
    .filter(Boolean)
    .join("; ");

  const html = await pageResp.text();
  const csrfToken = html.match(/"csrfToken":"([^"]+)"/)?.[1];
  if (!csrfToken || !cookie) {
    throw new Error("kleiner: could not read the board's CSRF token");
  }

  // Fetch all companies via the job board API
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-csrf-token": csrfToken,
      Cookie: cookie,
    },
    body: JSON.stringify({
      query: {},
      meta: { size: 500 },
      board: { id: "kleiner-perkins", isParent: true },
    }),
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch ${API_URL}: ${resp.status}`);
  }

  const data: { companies?: Company[] } = await resp.json();
  const companies: ScrapedCompany[] = (data.companies ?? []).map((c) => ({
    name: c.name,
    category: (c.markets || []).join(", "),
    url: c.website?.url || "",
  }));

  if (companies.length === 0) {
    throw new Error("kleiner: the board returned no companies");
  }

  return companies;
}
