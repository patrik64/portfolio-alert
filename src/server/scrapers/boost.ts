import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.boost.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page is empty shelves — "Featured", "Space",
// "Bio / Health", "Crypto" — that the page's own script fills from a feed
// of the fund's airtable, served by a small backend of the fund's. the feed
// is asked for the way the script asks, from the address the script names,
// and holds a company as fields: its name, a line about it, its site
// (typed as a bare domain, an address, or nothing yet: "Coming soon"), the
// shelves it goes on, the year the fund came in, where it is, and whether
// the fund is out of it. the script puts a company on each of its shelves
// and on the featured one, so one it puts nowhere is left out here too.

const FEED = /fetch\(\s*['"`](https?:\/\/[^'"`]+)['"`]\s*\)/;
// the shelves the page has, as the script names them
const SHELVES = new Set(['Bio / Health', 'Crypto', 'VR/AR', 'Space', 'Climate', 'AI', 'Other', 'Robotics']);
const DOMAIN = /^[\w-]+(\.[\w-]+)+(\/\S*)?$/;
const STEALTH = /^stealth\b/i;

interface Record {
	fields: {
		Name?: string;
		Website?: string;
		'Website Category'?: string[];
		'Website Featured'?: string;
		'Website Exited'?: string;
		'Year Invested'?: number | string;
	};
}

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/\s*,\s*/g, ' / ');

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const feed = (await fetchText(PAGE_URL)).match(FEED)?.[1];
	if (!feed) {
		throw new Error('boost: the portfolio page names no feed to read the companies from');
	}
	const { records } = JSON.parse(await fetchText(feed)) as { records?: Record[] };

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const { fields } of records ?? []) {
		const name = (fields.Name ?? '').replace(/\s+/g, ' ').trim();
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		const shelves = (fields['Website Category'] ?? []).filter((shelf) => SHELVES.has(shelf));
		if (shelves.length === 0 && fields['Website Featured'] !== 'Yes') continue;
		seen.add(name.toLowerCase());
		const site = (fields.Website ?? '').trim();
		const year = String(fields['Year Invested'] ?? '').match(/^(?:19|20)\d{2}$/)?.[0];
		companies.push({
			name,
			category: [...shelves.map(tag), year ? `Invested ${year}` : '', fields['Website Exited'] === 'Yes' ? 'Exited' : '']
				.filter(Boolean)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : DOMAIN.test(site) ? `https://${site}` : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('boost: no companies in the feed');
	}

	return companies;
}
