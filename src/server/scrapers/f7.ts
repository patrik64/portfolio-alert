import type { ScrapedCompany } from './types';

const DATA_URL = 'https://www.f7ventures.com/data.js';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// in october 2026 the fund swapped wordpress for a static page, whose portfolio
// is an empty list until a script draws it from data.js: a spreadsheet's
// export, a record per company with its name, a line about it, its founders
// and its site. a company the fund is out of names the buyer ("Microsoft"), and
// has no site, by design. nothing else is said of a company, and nothing marks
// when the fund came in.

const LIST = /window\.F7_COMPANIES\s*=\s*(\[[\s\S]*?\n\]);/;
const STEALTH = /^stealth\b/i;

// companies stored from the old site under the names it gave them
const STORED_AS: Record<string, string> = {
	'cloudeagle ai': 'CloudEagle',
	'death clock': 'Death Clock AI',
	// the company behind dagster, which the old site named after the product
	elementl: 'Dagster'
};

interface Record_ {
	company?: string;
	website?: string;
	acquiredBy?: string;
}

// the category is comma-joined, so a name holding a comma would read as two
const tag = (s: string) => s.trim().replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(DATA_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${DATA_URL}: ${resp.status}`);
	}
	const list = (await resp.text()).match(LIST)?.[1];
	if (!list) {
		throw new Error('f7: no list of companies in data.js');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const record of JSON.parse(list) as Record_[]) {
		const shown = (record.company ?? '').trim();
		const name = STORED_AS[shown.toLowerCase()] ?? shown;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const buyer = tag(record.acquiredBy ?? '');
		companies.push({
			name,
			category: buyer ? `Acquired by ${buyer}, Exited` : '',
			url: (record.website ?? '').trim()
		});
	}

	if (companies.length === 0) {
		throw new Error('f7: no companies in data.js');
	}

	return companies;
}
