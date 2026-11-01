import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.shorooq.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// astro: the rows show a name, a sector and a country, and open a popup filled from
// the json the page carries for it, so the whole list is in one script tag, with
// each company's site and, on those the fund is out of, how it ended: "Acquired",
// "Exited" or "Liquidated".
const DATA = /<script id="pf-data" type="application\/json">([\s\S]*?)<\/script>/;

interface Company {
	name?: string;
	website?: string;
	industry?: string;
	location?: string;
	status?: string;
}

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string | undefined) => (s ?? '').trim().replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const data = (await resp.text()).match(DATA)?.[1];
	if (!data) {
		throw new Error('shorooq: no company data in the page');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const { name: shown, website, industry, location, status } of JSON.parse(data) as Company[]) {
		const name = shown?.trim();
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const ended = tag(status);
		companies.push({
			name,
			category: [tag(industry), tag(location), ended === 'Exited' ? '' : ended, ended ? 'Exited' : '']
				.filter(Boolean)
				.join(', '),
			url: website ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('shorooq: no companies in the page data');
	}

	return companies;
}
