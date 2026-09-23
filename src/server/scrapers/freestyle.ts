import type { ScrapedCompany } from './types';

const LIST_URL = 'https://freestyle.vc/api/trpc/companies.list';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a react app, drawn in the browser: its companies page lists every company
// the site's trpc "companies.list" query returns, under "All", "Current" and
// "Acquired" tabs, so the query is asked here as the page asks it. each
// company comes with its site (none for most of the ones sold) and a status;
// "Acquired" is an exit. the category is "Other" for all but one, and says
// nothing.

const STEALTH = /^stealth\b/i;

interface Company {
	name?: string | null;
	websiteUrl?: string | null;
	status?: string | null;
	category?: string | null;
}

interface Answer {
	result?: { data?: { json?: Company[] } };
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// the site field is typed in by hand: a bare domain ("airtable.com") takes a
// scheme, and a line of prose where a site should be is no site
function website(raw: string): string {
	const text = clean(raw);
	if (/^https?:\/\/\S+$/i.test(text)) return text;
	if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(text)) return `https://${text}`;
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(LIST_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${LIST_URL}: ${resp.status}`);
	}
	const rows = ((await resp.json()) as Answer).result?.data?.json ?? [];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of rows) {
		const name = clean(row.name ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const category = tag(row.category ?? '');
		companies.push({
			name,
			category: [
				/^other$/i.test(category) ? '' : category,
				/^(acquired|exited|ipo)\b/i.test(row.status ?? '') ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: website(row.websiteUrl ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('freestyle: the companies query lists no companies');
	}

	return companies;
}
