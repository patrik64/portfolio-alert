import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.electriccapital.com/investments/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js: the investments page carries its data in the __NEXT_DATA__
// script, a record per company — the name, a line about it, its site and a
// type: "Current", "Current (Stealth)", noted as a tag, or "Acquired", kept
// as the outcome. the page files companies under nothing else.

const NEXT_DATA = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;
const STEALTH = /^stealth\b/i;

interface Company {
	name?: string;
	type?: string;
	website_url?: string;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const json = (await resp.text()).match(NEXT_DATA)?.[1];
	if (!json) {
		throw new Error('electric: the investments page carries no data');
	}
	const data = JSON.parse(json) as { props?: { pageProps?: { companies?: Company[] } } };
	const records = data.props?.pageProps?.companies ?? [];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const record of records) {
		const name = clean(record.name ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const type = tag(record.type ?? '');
		const exited = /^(acquired|exited|ipo|merged)\b/i.test(type);
		companies.push({
			name,
			category: [/stealth/i.test(type) ? 'Stealth' : '', exited ? type : '', exited ? 'Exited' : '']
				.filter(Boolean)
				.join(', '),
			url: clean(record.website_url ?? '') || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('electric: no companies in the investments page data');
	}

	return companies;
}
