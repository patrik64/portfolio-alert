import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://tribecavp.com/companies/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress behind alpine.js: the grid is drawn in the browser, but from a
// list written into the page rather than fetched, so one request has it all.
//
// a company's own address is the first of its social links, the one the site
// marks with a display icon; the others are its linkedin and twitter.
//
// the status field says how a company left in four different ways — "Exited",
// "ACQ: <acquirer>", "NASDAQ: <ticker>", or nothing at all — and all of them
// come down to the house's two tags.

const ARRAY = /companies:\s*\[/;

interface Company {
	title?: string;
	companyDetails?: {
		status?: string | null;
		socialLinks?: { type?: string; url?: string }[] | null;
	};
	companySectors?: { nodes?: { name?: string }[] };
	companyFirstInvestments?: { nodes?: { name?: string }[] };
}

// slice out the array starting at `from`, tracking strings so brackets inside
// a company's write-up can't end it early
function sliceArray(html: string, from: number): string {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = from; i < html.length; i++) {
		const ch = html[i];
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === '\\') escaped = true;
			else if (ch === '"') inString = false;
		} else if (ch === '"') inString = true;
		else if (ch === '[') depth++;
		else if (ch === ']' && --depth === 0) return html.slice(from, i + 1);
	}
	throw new Error('tribecavp: the companies array never closes');
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const at = html.match(ARRAY);
	if (at?.index === undefined) {
		throw new Error('tribecavp: no companies list in the page');
	}
	const rows = JSON.parse(sliceArray(html, at.index + at[0].length - 1)) as Company[];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of rows) {
		const name = (row.title ?? '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);

		const status = (row.companyDetails?.status ?? '').trim();
		const tags = [
			...(row.companySectors?.nodes ?? []).map((n) => (n.name ?? '').trim()),
			...(row.companyFirstInvestments?.nodes ?? []).map((n) => (n.name ?? '').trim()),
			/^acq\b/i.test(status) ? 'Acquired' : status ? 'Exited' : ''
		].filter(Boolean);

		companies.push({
			name,
			category: tags.join(', '),
			url:
				(row.companyDetails?.socialLinks ?? []).find((link) =>
					/display/i.test(link.type ?? '')
				)?.url ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('tribecavp: no companies in the page list');
	}

	return companies;
}
