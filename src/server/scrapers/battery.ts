import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.battery.com";
const LIST_URL = `${BASE_URL}/list-of-all-companies/`;
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 250;

// top-level sectors of the company directory's filter
const SECTORS: [string, string][] = [
  ["application-software", "Application Software"],
  ["infrastructure-software", "Infrastructure Software"],
  ["consumer", "Consumer"],
  ["industrial-tech", "Industrial Tech + Life Science Tools"],
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  sectors: string[];
}

async function ajax(params: Record<string, string | number>): Promise<{
  htmls: string;
  docpage: number;
  isPagi: number;
  cntpgs: number;
  currentcnt: number;
}> {
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
  const resp = await fetch(AJAX_URL, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!resp.ok) {
    throw new Error(`Failed to fetch battery company directory: ${resp.status}`);
  }
  return await resp.json();
}

// the directory pages itself by feeding docpage/isPagi back into each request
async function walkDirectory(sector: string): Promise<DirectoryEntry[]> {
  const entries: DirectoryEntry[] = [];
  let docpage = 1;
  let pagination = 0;

  for (let guard = 0; guard < 100; guard++) {
    const data = await ajax({ sector, docpage, pagination });
    for (const m of data.htmls.matchAll(
      /<a href="(https:\/\/www\.battery\.com\/company\/[^"]+)"[\s\S]*?alt="([^"]*)"[\s\S]*?<div class="text-block-16">([\s\S]*?)<\/div>/g,
    )) {
      // the meta block is "Location<br/>Status"
      const status = m[3].split(/<br\s*\/?>/)[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
      entries.push({ name: m[2].trim(), path: m[1], status, sectors: [] });
    }
    if (data.currentcnt >= data.cntpgs) break;
    docpage = data.docpage;
    pagination = data.isPagi;
    await sleep(BATCH_DELAY_MS);
  }
  return entries;
}

// each company's detail page wraps its logo in a link to the company website
async function fetchWebsite(path: string, attempt = 1): Promise<string> {
  try {
    const resp = await fetch(path, { headers: { "User-Agent": UA } });
    if (!resp.ok) throw new Error(`${resp.status}`);
    const html = await resp.text();
    const website = html.match(
      /class="company-detail-logo[^"]*">\s*<a\s+href="(https?:\/\/[^"]+)"/,
    )?.[1];
    return website && !/battery\.com/.test(website) ? website : "";
  } catch {
    if (attempt < 3) {
      await sleep(1000 * attempt);
      return fetchWebsite(path, attempt + 1);
    }
    return "";
  }
}

export async function scrape(): Promise<ScrapedCompany[]> {
  // 1. the statutory list is the complete record of every investment, but
  //    carries names only
  const listResp = await fetch(LIST_URL, { headers: { "User-Agent": UA } });
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

  // 2. the company directory carries websites, sectors and exit details
  const directory = await walkDirectory("0");
  const byPath = new Map(directory.map((e) => [e.path, e]));
  for (const [slug, label] of SECTORS) {
    for (const entry of await walkDirectory(slug)) {
      const target = byPath.get(entry.path);
      if (target && !target.sectors.includes(label)) target.sectors.push(label);
    }
  }

  const websiteByPath = new Map<string, string>();
  for (let i = 0; i < directory.length; i += BATCH_SIZE) {
    const batch = directory.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (e) => ({ path: e.path, website: await fetchWebsite(e.path) })),
    );
    for (const r of results) {
      websiteByPath.set(r.path, r.website);
    }
    await sleep(BATCH_DELAY_MS);
  }

  // 3. merge: enrich statutory entries with directory data, then append the
  //    directory-only companies (recent investments not yet in the list)
  const directoryByKey = new Map<string, DirectoryEntry>();
  for (const entry of directory) {
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
    const category = [...(match?.sectors ?? []), status || (entry.exited ? "Exited" : "")]
      .filter(Boolean)
      .join(", ");

    return {
      name: entry.name,
      category,
      url: match ? (websiteByPath.get(match.path) ?? "") : "",
    };
  });

  for (const entry of directory) {
    if (used.has(entry.path)) continue;
    const status = entry.status && entry.status !== "Active" ? entry.status : "";
    companies.push({
      name: entry.name,
      category: [...entry.sectors, status].filter(Boolean).join(", "),
      url: websiteByPath.get(entry.path) ?? "",
    });
  }

  return companies;
}
