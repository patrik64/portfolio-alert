import { request } from "node:https";
import type { ScrapedCompany } from "./types";

const PAGE_URL = "https://www.balderton.com/companies/";
const UA = "portfolio-alert/1.0 (+https://portfolio-alert.vercel.app)";

const NAMED: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };

const decode = (s: string) =>
  s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (whole, dec, hex, named) => {
    if (dec) return String.fromCodePoint(Number(dec));
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    return NAMED[String(named).toLowerCase()] ?? whole;
  });

const text = (s: string) =>
  decode(s.replace(/<[^>]+>/g, " "))
    .replace(/​/g, "")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();

interface RefreshResponse {
  template: string;
  facets?: Record<string, string>;
  settings?: { pager?: { total_rows?: number; total_pages?: number } };
}

interface Answer {
  status: number;
  body: string;
}

// cloudflare's block page, answered since october 2026 — from a laptop as from
// the deployment, on every path but robots.txt and the news feed — to every
// request that claims to be a browser without being one, and to fetch's
// requests whatever they claim: undici's signature, it seems. a client that
// says what it is, over http/1.1 through node's https module, is let through,
// so that is how the listing is asked for
const BLOCKED = /Sorry, you have been blocked|Attention Required! \| Cloudflare/;

// the firewall's answer, which asking again cannot change
class Blocked extends Error {}

function post(url: string, body: string): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "POST",
        headers: {
          "User-Agent": UA,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }),
        );
        res.on("error", reject);
      },
    );
    req.setTimeout(30_000, () => req.destroy(new Error(`balderton: ${url} did not answer in 30 s`)));
    req.on("error", reject);
    req.end(body);
  });
}

// the grid is a FacetWP listing in auto-detect mode: pages are fetched by
// POSTing the refresh action to the listing page itself, which answers with
// the full page render plus the pager state
async function fetchRefreshPage(paged: number): Promise<RefreshResponse> {
  const body = JSON.stringify({
    action: "facetwp_refresh",
    data: {
      facets: { company_pager: [], company_sector: [], company_status: [], company_location: [] },
      frozen_facets: {},
      http_params: { get: [], uri: "companies", url_vars: [] },
      template: "wp",
      extras: { sort: "default" },
      soft_refresh: 0,
      is_bfcache: 0,
      first_load: 0,
      paged,
    },
  });
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { status, body: raw } = await post(PAGE_URL, body);
      if (status !== 200) {
        // the dashboard should say what it is rather than show a bare status
        if (status === 403 && BLOCKED.test(raw)) {
          throw new Blocked(
            'balderton: cloudflare blocks the request outright ("Sorry, you have been blocked")',
          );
        }
        throw new Error(`Failed to fetch ${PAGE_URL} page ${paged}: ${status}`);
      }
      const start = raw.indexOf('{"facets');
      if (start < 0) {
        throw new Error(`balderton: page ${paged} did not answer with the listing payload`);
      }
      return JSON.parse(raw.slice(start));
    } catch (err) {
      if (err instanceof Blocked) throw err;
      lastError = err;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  throw lastError;
}

// human-readable sector labels come from the sector facet the same response
// carries ("ai-machine-learning" is shown as "AI & machine learning")
function sectorLabels(facetHtml: string): Map<string, string> {
  const labels = new Map<string, string>();
  for (const m of facetHtml.matchAll(/data-value="([^"]+)"[^>]*>(?:\s*<span[^>]*>)?([^<]*)/g)) {
    const label = text(m[2]).replace(/\s*\(\d+\)$/, "");
    if (label) labels.set(m[1], label);
  }
  return labels;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const first = await fetchRefreshPage(1);
  const totalRows = first.settings?.pager?.total_rows ?? 0;
  const totalPages = first.settings?.pager?.total_pages ?? 0;
  if (!totalRows || !totalPages) {
    throw new Error("balderton: the pager reported no companies — the listing moved");
  }
  const labels = sectorLabels(first.facets?.company_sector ?? "");

  const byName = new Map<string, ScrapedCompany>();
  for (let paged = 1; paged <= totalPages; paged++) {
    const page = paged === 1 ? first : await fetchRefreshPage(paged);
    // the render also carries a featured-companies carousel above the grid;
    // only cards after the facetwp-template marker belong to the listing
    const grid = page.template.slice(page.template.indexOf("facetwp-template"));
    const cards = grid.split('<div class="card ').slice(1);
    for (const card of cards) {
      const classes = card.slice(0, card.indexOf('"'));
      if (!classes.includes("type-company")) continue;
      const name = text(card.match(/<h3 id="[^"]*">([\s\S]*?)<\/h3>/)?.[1] ?? "");
      if (!name || byName.has(name)) continue;

      const sectorSlug = classes.match(/\bsector-([a-z0-9-]+)/)?.[1] ?? "";
      // "Other" is the page's catch-all, not a sector
      const sector = labels.get(sectorSlug)?.replace(/^Other$/, "") ?? "";
      const location = text(card.match(/class="label-M[^"]*"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "");
      // the wrapper also carries WordPress's own status-publish class, so the
      // exit marker is matched by its exact name
      const exited = /\bstatus-exited\b/.test(classes);

      byName.set(name, {
        name,
        category: [sector, location, exited ? "Exited" : ""].filter(Boolean).join(", "),
        url: card.match(/<a class="mask" href="(https?:\/\/[^"]+)"/)?.[1] ?? "",
      });
    }
  }

  const companies = [...byName.values()];
  if (companies.length !== totalRows) {
    throw new Error(
      `balderton: found ${companies.length} companies but the pager promises ${totalRows}`,
    );
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("balderton: the sector and location markers moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("balderton: the companies' website links moved");
  }

  return companies;
}
