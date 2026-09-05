import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.moneta.vc/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress. the wall itself is only logos linked out, with the company's name
// in an attribute and nothing else, but the page hands its own filtering
// script the whole list underneath: a record each with the fund's segments for
// the company, which of its funds holds it, and whether it still does.
//
// that list is what is read, and not the wall, because the wall marks every
// tile active — the class is what the filter shows and hides rather than what
// the fund says about the company. reading it would have called all fifty-
// three current when ten of them have gone.
//
// which of Fund I, II and III holds a company is the fund's own structure
// rather than anything about the company, so it is left off. Exited is written
// the way the fund's own filter writes it; active is the state a company is in
// unless something has happened, and is not written down.

const LIST = /window\.portfolio_items\s*=\s*/;
// the state a company is in unless the fund says otherwise
const DEFAULT_STATE = /^active$/i;

interface Item {
	title?: string;
	link?: string;
	status?: string;
	segment?: { name?: string }[];
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the array is written straight into the page, so it ends where its own
// brackets balance rather than at any character that can be searched for
function readList(html: string): Item[] {
	const declared = html.search(LIST);
	if (declared === -1) {
		throw new Error('moneta: the page no longer carries its portfolio list');
	}
	const from = html.indexOf('[', declared);
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let at = from; at < html.length; at++) {
		const c = html[at];
		if (inString) {
			if (escaped) escaped = false;
			else if (c === '\\') escaped = true;
			else if (c === '"') inString = false;
		} else if (c === '"') inString = true;
		else if (c === '[') depth++;
		else if (c === ']' && --depth === 0) {
			return JSON.parse(html.slice(from, at + 1)) as Item[];
		}
	}
	throw new Error('moneta: the portfolio list does not close');
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of readList(await resp.text())) {
		const name = clean(item.title ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const state = clean(item.status ?? '');
		companies.push({
			name,
			category: [
				...(item.segment ?? []).map((segment) => clean(segment.name ?? '')),
				state && !DEFAULT_STATE.test(state) ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: clean(item.link ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('moneta: no companies in the portfolio list');
	}

	return companies;
}
