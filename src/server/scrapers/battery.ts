import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.battery.com";
const LIST_URL = `${BASE_URL}/list-of-all-companies/`;
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
// the company pages are asked for a few at a time, a pause between the rounds
const BATCH_SIZE = 4;
const BATCH_DELAY_MS = 250;
// the directory's pages, should it have to be paged, come one a second
const PAGE_DELAY_MS = 1000;
// a refusal (429) is waited out once, for as long as the site asks within reason
const REFUSED_MS = 20_000;
const REFUSED_MAX_MS = 30_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;

// two sources: the statutory list of every investment, names only, and the
// company directory, which carries each company's page, location and status.
// the directory is a wordpress ajax action behind cloudflare that refuses a
// datacenter address after a few dozen calls in a row, so it is asked once,
// for the whole list (allCompany=1), and paged only if that one answer comes
// up short. a company's page gives its site and its sectors ("Application
// Software, AI-Powered Apps"). the tags are the directory filter's four
// top-level sectors, which file a company under a sub-sector's parent too,
// so each top-level sector's own page is read for the sub-sectors it lists
// and a company's sectors are mapped up to them. the status is kept as the
// directory writes it ("Acquired by Syndigo", "Sold to Insight").

// the top-level sectors of the company directory's filter, each with a page
const TOP: [string, string][] = [
  ["application-software", "Application Software"],
  ["infrastructure-software", "Infrastructure Software"],
  ["consumer", "Consumer"],
  ["industrial-tech", "Industrial Tech + Life Science Tools"],
];

const CARD =
  /<a href="(https:\/\/www\.battery\.com\/company\/[^"]+)"[\s\S]*?alt="([^"]*)"[\s\S]*?<div class="text-block-16">([\s\S]*?)<\/div>/g;
const WEBSITE = /class="company-detail-logo[^"]*">\s*<a\s+href="(https?:\/\/[^"]+)"/;
const SECTOR_ROW = /<div class="comp-det-sub">SECTORS<\/div>\s*<div>([\s\S]*?)<\/div>/;
// a sector page's filter links, the first for the sector itself ("ALL SUBSECTORS")
const SUBSECTOR = /onclick="sectorfilterSelection\('([^']+)','sector'\);"[^>]*>([^<]*)</g;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// a sector by whichever spelling: "Sales / Marketing" on the sector page,
// "Sales & Marketing" on a company's, "sales-marketing" in the filter
const sectorKey = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// each sector, top-level or sub-sector, to the top-level name it is filed
// under; a sector page that will not load leaves its sub-sectors unmapped
async function sectorParents(): Promise<Map<string, string>> {
  const parents = new Map<string, string>();
  for (const [slug, name] of TOP) {
    parents.set(sectorKey(slug), name);
    parents.set(sectorKey(name), name);
    try {
      const resp = await get(`${BASE_URL}/${slug}/`, { headers: { "User-Agent": UA } });
      if (!resp.ok) {
        await resp.body?.cancel();
        continue;
      }
      for (const [, sub, label] of (await resp.text()).matchAll(SUBSECTOR)) {
        if (!parents.has(sectorKey(sub))) parents.set(sectorKey(sub), name);
        if (!parents.has(sectorKey(label))) parents.set(sectorKey(label), name);
      }
    } catch {
      // the company pages still name the top-level sectors themselves
    }
    await sleep(BATCH_DELAY_MS);
  }
  return parents;
}

// how long a refusal asks to be left alone, or the usual wait when it says nothing usable
function refusedFor(resp: Response): number {
  const after = Number(resp.headers.get("retry-after"));
  return after > 0 ? Math.min(after * 1000, REFUSED_MAX_MS) : REFUSED_MS;
}

// a response, or a refusal waited out once
async function get(url: string, init?: RequestInit): Promise<Response> {
  const resp = await fetch(url, init);
  if (resp.status !== 429) return resp;
  const wait = refusedFor(resp);
  await resp.body?.cancel();
  await sleep(wait);
  return fetch(url, init);
}

// company identity differs between the two sources ("1mind" in the directory,
// "1mind AI, Inc." in the statutory list), so compare on a stripped form
function matchKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&#?\w+;/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(
      /\b(inc|llc|ltd|corp|corporation|co|company|holdings|group|technologies|technology|software|systems|labs|sa|ag|gmbh|plc|limited|the)\b/g,
      " ",
    )
    .replace(/[^a-z0-9]+/g, "");
}

interface DirectoryEntry {
  name: string;
  path: string;
  status: string;
}

interface DirectoryPage {
  htmls: string;
  docpage: number;
  isPagi: number;
  cntpgs: number;
  currentcnt: number;
}

async function ajax(params: Record<string, string | number>): Promise<DirectoryPage> {
  const body = new URLSearchParams({
    action: "loadbatterycompanieswithFilter",
    pagination: "0",
    sector: "0",
    location: "0",
    stage: "0",
    status: "0",
    docpage: "1",
    allCompany: "",
    companySearch: "",
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });
  const resp = await get(AJAX_URL, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!resp.ok) {
    throw new Error(
      resp.status === 429
        ? `battery: the company directory refused this address twice (429)`
        : `Failed to fetch battery company directory: ${resp.status}`,
    );
  }
  return await resp.json();
}

function cardsOf(htmls: string): DirectoryEntry[] {
  const entries: DirectoryEntry[] = [];
  for (const m of htmls.matchAll(CARD)) {
    // the meta block is "Location<br/>Status"
    const status = m[3].split(/<br\s*\/?>/)[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
    entries.push({ name: m[2].trim(), path: m[1], status });
  }
  return entries;
}

// the whole directory in one answer; failing that, page by page, as the page
// itself does by feeding docpage/isPagi back into each request
async function directory(): Promise<DirectoryEntry[]> {
  const whole = await ajax({ allCompany: 1 });
  let entries = cardsOf(whole.htmls);
  if (entries.length < whole.cntpgs) {
    entries = [];
    let docpage = 1;
    let pagination = 0;
    for (let guard = 0; guard < 100; guard++) {
      const data = await ajax({ docpage, pagination });
      entries.push(...cardsOf(data.htmls));
      if (data.currentcnt >= data.cntpgs) break;
      docpage = data.docpage;
      pagination = data.isPagi;
      await sleep(PAGE_DELAY_MS);
    }
  }
  // a part of the directory must not pass for the whole
  if (entries.length < whole.cntpgs) {
    throw new Error(`battery: the company directory gave ${entries.length} of its ${whole.cntpgs} companies`);
  }
  return entries;
}

interface Detail {
  website: string;
  sectors: string[];
}

// a company's page wraps its logo in a link to the company website and lists
// its sectors as the site names them ("Application Software, AI-Powered Apps")
async function detailOf(path: string, attempt = 1): Promise<Detail> {
  try {
    const resp = await get(path, { headers: { "User-Agent": UA } });
    if (!resp.ok) throw new Error(`${resp.status}`);
    const html = await resp.text();
    const website = html.match(WEBSITE)?.[1];
    const sectors = (html.match(SECTOR_ROW)?.[1] ?? "")
      .split(/<span class="sector-separator">[\s\S]*?<\/span>/)
      .map((s) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    return { website: website && !/battery\.com/.test(website) ? website : "", sectors };
  } catch {
    if (attempt < 3) {
      await sleep(1000 * attempt);
      return detailOf(path, attempt + 1);
    }
    return { website: "", sectors: [] };
  }
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const started = Date.now();

  // 1. the statutory list is the complete record of every investment, but
  //    carries names only
  const listResp = await get(LIST_URL, { headers: { "User-Agent": UA } });
  if (!listResp.ok) {
    throw new Error(`Failed to fetch ${LIST_URL}: ${listResp.status}`);
  }
  const listHtml = await listResp.text();

  interface LegalEntry {
    name: string;
    exited: boolean;
  }
  const legal: LegalEntry[] = [];
  for (const m of listHtml.matchAll(/<p>([\s\S]{2,200}?)<\/p>/g)) {
    const entry = m[1].replace(/<[^>]+>/g, "").trim();
    if (entry.length > 100) continue; // prose paragraphs, not company names
    if (entry.includes("Battery has invested")) continue;
    if (entry.includes("investment staff")) continue;
    if (entry.startsWith("* Denotes")) continue;
    if (entry.includes("cookies")) continue;
    if (entry.includes("browsing experience")) continue;
    if (entry.includes("categorized")) continue;
    if (entry.includes("classified")) continue;

    const exited = entry.endsWith("*");
    const name = entry.replace(/\s*\*\s*$/, "").trim();
    if (name) legal.push({ name, exited });
  }

  // 2. the company directory carries pages and status, the pages websites
  //    and sectors; a page not reached by the deadline, or that will not
  //    load, leaves its company with neither
  const entries = await directory();
  const parents = await sectorParents();
  const details = new Map<string, Detail>();
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    if (Date.now() - started > DEADLINE_MS) break;
    const batch = entries.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (e) => [e.path, await detailOf(e.path)] as const),
    );
    for (const [path, detail] of results) details.set(path, detail);
    if (i + BATCH_SIZE < entries.length) await sleep(BATCH_DELAY_MS);
  }
  // the top-level sectors a company is filed under, in the filter's order
  const sectorsOf = (e: DirectoryEntry) => {
    const filed = new Set(
      (details.get(e.path)?.sectors ?? []).map((s) => parents.get(sectorKey(s))).filter(Boolean),
    );
    return TOP.map(([, name]) => name).filter((name) => filed.has(name));
  };
  const websiteOf = (e: DirectoryEntry) => details.get(e.path)?.website ?? "";

  // 3. merge: enrich statutory entries with directory data, then append the
  //    directory-only companies (recent investments not yet in the list)
  const directoryByKey = new Map<string, DirectoryEntry>();
  for (const entry of entries) {
    const key = matchKey(entry.name);
    if (key && !directoryByKey.has(key)) directoryByKey.set(key, entry);
  }
  const legalKeys = legal.map((l) => ({ ...l, key: matchKey(l.name) }));

  const used = new Set<string>();
  const companies: ScrapedCompany[] = legalKeys.map((entry) => {
    let match = directoryByKey.get(entry.key);
    if (!match && entry.key.length >= 4) {
      // the directory uses short trading names ("1mind" for "1mind AI, Inc.")
      const candidates = [...directoryByKey].filter(
        ([key]) => key.length >= 4 && entry.key.startsWith(key),
      );
      if (candidates.length === 1) match = candidates[0][1];
    }
    if (match) used.add(match.path);

    const status = match?.status && match.status !== "Active" ? match.status : "";
    const category = [...(match ? sectorsOf(match) : []), status || (entry.exited ? "Exited" : "")]
      .filter(Boolean)
      .join(", ");

    return {
      name: entry.name,
      category,
      url: match ? websiteOf(match) : "",
    };
  });

  for (const entry of entries) {
    if (used.has(entry.path)) continue;
    const status = entry.status && entry.status !== "Active" ? entry.status : "";
    companies.push({
      name: entry.name,
      category: [...sectorsOf(entry), status].filter(Boolean).join(", "),
      url: websiteOf(entry),
    });
  }

  return companies;
}
