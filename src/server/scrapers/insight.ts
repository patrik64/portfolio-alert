import * as cheerio from 'cheerio';
import type { ScrapedCompany } from './types';

const BASE_API = "https://www.insightpartners.com/wp-json";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// a company renamed since it was stored is kept under the name it was stored
// as, so it is not taken for a new company: on 2026-11-13 the site took the
// former names out of its titles ("Anaconda (fka Continuum Analytics)" is now
// "Anaconda"), and the slugs kept them only now and then
const STORED_AS: Record<string, string> = {
  anaconda: "Anaconda (fka Continuum Analytics)",
  bluewhite: "Bluewhite (fka Blue White Robotics)",
  bonterra: "Bonterra (fka EveryAction)",
  "candy fanatics": "Candy Fanatics (fka Candy Digital)",
  class: "Class (fka ClassEDU)",
  coast: "Coast (FKA VayU)",
  corelight: "Corelight (fka Broala)",
  coreview: "CoreView (FKA 4ward365)",
  cotality: "Cotality (fka CoreLogic)",
  delinea: "Delinea (FKA ThycoticCentrify)",
  dotmatics: "Dotmatics (FKA Insightful Science GraphPad)",
  "echo ai": "Echo AI (fka Pathlight)",
  expresssteuer: "ExpressSteuer (fka Express Group)",
  facilityos: "FacilityOS (fka iLobby)",
  flovision: "Flovision (formerly FloWaste)",
  forta: "Forta (fka Montera)",
  glia: "Glia (fka SaleMove)",
  indrive: "InDrive (fka inDriver)",
  "iterative health": "Iterative Health (fka Iterative Scopes)",
  jit: "Jit (fka Cbrix)",
  "leal health": "Leal Health (fka TrialJectory)",
  marigold: "Marigold (fka Campaign Monitor)",
  "markt pilot": "Markt Pilot (aka MP)",
  "misfits market": "Misfits Market (fka Imperfect Foods)",
  "pdi technologies": "PDI Technologies (fka PDI Software)",
  plume: "Plume (fka Plume Design)",
  quantive: "Quantive (fka Gtmhub)",
  rhyme: "Rhyme (fka PriorAuthNow)",
  root: "Root (fka Slim.ai)",
  "saks global": "Saks Global (fka Saks Fifth Avenue)",
  seated: "Seated (fka Voco)",
  sensi: "Sensi (fka Clanz)",
  singlestore: "SingleStore (fka MemSQL)",
  sware: "Sware (fka BTR)",
  valence: "Valence (FKA Shift)",
  vela: "Vela (FKA SR Labs)",
  vetted: "Vetted (FKA Lustre)",
  y42: "y42 (fka datos intelligence)",
  yoom: "Yoom (fka Tetavi)",
  yubi: "Yubi (fka CredAvenue)",
};

// the titles come entity-encoded ("Weights &amp; Biases", "IZOIC&#8217;s")
const unescape = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

interface CompanyPost {
  id: number;
  slug: string;
  title: { rendered: string };
}

// Phase 2: Fetch company details (sector + URL) from custom API in batches
async function fetchCompanyDetail(
  id: number,
): Promise<{ category: string; url: string }> {
  try {
    const resp = await fetch(
      `${BASE_API}/insight/v1/get-company-content?id=${id}`,
      { headers: { "User-Agent": UA } },
    );
    const raw = await resp.text();
    // Response is double-JSON-encoded
    const parsed = JSON.parse(JSON.parse(raw));
    const html = parsed.content || "";
    const $ = cheerio.load(html);

    // Extract sectors from vertical links
    const sectors: string[] = [];
    $('a[href*="vertical="]').each((_, el) => {
      const text = $(el).text().trim();
      if (text && !sectors.includes(text)) sectors.push(text);
    });

    // Extract website URL from "Learn More About" link
    const url =
      $('a[title^="Learn More About"]').first().attr("href") || "";

    return { category: sectors.join(", "), url };
  } catch {
    return { category: "", url: "" };
  }
}

const BATCH_SIZE = 20;

export async function scrape(): Promise<ScrapedCompany[]> {
  // Phase 1: Fetch all companies via WP REST API (paginated, 100 per page)
  const posts: CompanyPost[] = [];
  let page = 1;

  // paged in the order the posts were made: hundreds of them share the moment
  // they were imported, so paging by date (the default) let the pages overlap
  // and skip, a different few dozen each time — 822 of 866 read on 2026-11-14
  while (true) {
    const resp = await fetch(
      `${BASE_API}/wp/v2/sfcompany?per_page=100&page=${page}&orderby=id&order=asc&_fields=id,title,slug`,
      { headers: { "User-Agent": UA } },
    );
    if (resp.status === 400) break;

    const data: CompanyPost[] = await resp.json();
    if (data.length === 0) break;
    posts.push(...data);
    page++;
  }

  const detailMap = new Map<number, { category: string; url: string }>();

  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (p) => ({
        id: p.id,
        detail: await fetchCompanyDetail(p.id),
      })),
    );
    for (const r of results) {
      detailMap.set(r.id, r.detail);
    }
  }

  // Build final company list
  const companies: ScrapedCompany[] = posts.map((p) => {
    const written = unescape(p.title.rendered).replace(/\s+/g, " ").trim();
    return {
      name: STORED_AS[written.toLowerCase()] ?? written,
      category: detailMap.get(p.id)?.category || "",
      url: detailMap.get(p.id)?.url || "",
    };
  });

  return companies;
}
