import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.proventure.no';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the fund's exits are listed on a page of their own
const EXITS_URL = `${BASE_URL}/proventure-exits`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wix: the portfolio page and the exits page are each a repeater of cards
// drawn from the site's portfolio collection, the records the page shows
// served whole in its warmup data — a company each with its name, its
// site, its segment ("Oil Service", "MedTech"), its town ("Stavanger"),
// the fund it sits in ("Seed III") and when the fund invested ("December
// 2016"). a name may carry a note in brackets ("SnapMed (Dr. Dropin Hud)",
// "Scale Protection (Arctic Well Invest)") or its legal form ("Arctic
// Silicon Devices AS"), neither part of it; the page's placeholder card
// ("Work in progress") is passed over. the segment, the town, the fund and
// the year are kept as tags, a company on the exits page with the Exited
// tag. both pages must load.

const WARMUP = /<script type="application\/json" id="wix-warmup-data">([\s\S]*?)<\/script>/;
const COLLECTION = 'Portfolionew';
const NOTE = /\s*\([^()]*\)\s*$/;
const FORM = /\s+(?:as|asa)$/i;
const PLACEHOLDER = /^work in progress$/i;
const YEAR = /\b(?:19|20)\d{2}\b/;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Entry {
	title?: string;
	website?: string | null;
	segment?: string | null;
	headquarters?: string | null;
	fund?: string | null;
	timeOfInvestment?: string | null;
	timeOfExit?: string | null;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// "SnapMed (Dr. Dropin Hud)" -> "SnapMed", "Arctic Silicon Devices AS" -> "Arctic Silicon Devices"
function nameOf(written: string): string {
	let name = written;
	for (let before = ''; before !== name; ) {
		before = name;
		name = name.replace(NOTE, '').replace(FORM, '').trim();
	}
	return name || written;
}

// the collection's records a page carries
async function entriesOf(url: string): Promise<Entry[]> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	const data = JSON.parse((await resp.text()).match(WARMUP)?.[1] ?? 'null');
	const records = data?.appsWarmupData?.dataBinding?.dataStore?.recordsByCollectionId?.[COLLECTION];
	const entries: Entry[] = Object.values(records ?? {}).filter((r): r is Entry => !!r && typeof r === 'object');
	if (entries.length === 0) {
		throw new Error(`proventure: ${url} carries no portfolio records — the page moved`);
	}
	return entries;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const held = await entriesOf(PAGE_URL);
	const exited = await entriesOf(EXITS_URL);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [entry, out] of [...held.map((e) => [e, false] as const), ...exited.map((e) => [e, true] as const)]) {
		const written = clean(entry.title ?? '');
		const name = nameOf(written);
		if (!name || PLACEHOLDER.test(name) || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const year = clean(entry.timeOfInvestment ?? '').match(YEAR)?.[0];
		const site = clean(entry.website ?? '');
		companies.push({
			name,
			category: [
				tag(entry.segment ?? ''),
				tag(entry.headquarters ?? ''),
				tag(entry.fund ?? ''),
				year ? `Invested ${year}` : '',
				out || /^exited$/i.test(clean(entry.timeOfExit ?? '')) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : out ? EXITS_URL : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('proventure: the portfolio names no companies');
	}

	return companies;
}
