import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://e2mc.space/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// nuxt over a headless cms: the portfolio page shows its companies as cards
// that open into details, and hands the browser what fills them in its
// __NUXT_DATA__ script — one flat array that records point into by index,
// a record per company with the name, its site, where it is based ("HQ:
// Munich, Germany") and which vehicle invested ("E2MC Ventures 2
// Investment · Orbital Edge Cohort 1"). the records are read from there;
// nothing marks an exit.

const NUXT_DATA = /<script[^>]*\bid="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;
const STEALTH = /^stealth\b/i;

type Entry = unknown;

interface Record_ {
	name?: Entry;
	href?: Entry;
	location?: Entry;
	investment?: Entry;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a place written "Munich, Germany" would
// read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// the string a record's field points at, or nothing
const text = (data: Entry[], at: Entry): string => {
	const value = typeof at === 'number' ? data[at] : at;
	return typeof value === 'string' ? value : '';
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const json = (await resp.text()).match(NUXT_DATA)?.[1];
	if (!json) {
		throw new Error('e2mc: the portfolio page hands over no data');
	}
	const data = JSON.parse(json) as Entry[];
	const records = data.filter(
		(entry): entry is Record_ =>
			!!entry && typeof entry === 'object' && !Array.isArray(entry) && 'name' in entry && 'investment' in entry
	);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const record of records) {
		const name = clean(text(data, record.name));
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: [
				tag(text(data, record.location).replace(/^\s*HQ\s*:\s*/i, '')),
				// "E2MC Ventures 2 Investment · Orbital Edge Cohort 1", a tag apiece
				...text(data, record.investment)
					.split(/\s*[·•|]\s*/)
					.map((part) => tag(part.replace(/\s+investment$/i, '')))
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: clean(text(data, record.href)) || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('e2mc: no companies in the data the portfolio page hands over');
	}

	return companies;
}
