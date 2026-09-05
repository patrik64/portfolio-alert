import type { ScrapedCompany } from './types';

const BASE_URL = 'https://valor.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the page is a Next.js app whose flight payload hands the card grid one
// `"companies":[...]` array straight out of the fund's back office — far more
// fields than the cards show. only a few are usable: the name, the website,
// the sector labels and the status, whose "Exited" value is the gold ribbon
// across an exited company's logo.
//
// the cards link to the fund's own detail pages, but the slug in that link is
// built from the name and does not always match the record's own `slug`
// ("tiq" for Therapy IQ, none at all for EasyAudit AI), so the links come from
// the rendered markup, paired with the company name in the logo's alt text.

interface Company {
	name?: string;
	website?: string;
	tags?: string | null;
	industries?: string[] | null;
	status?: string | null;
	published?: boolean;
}

// slice out the array starting at `from`, tracking strings so brackets inside
// the long description texts can't end it early
function sliceArray(payload: string, from: number): string {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = from; i < payload.length; i++) {
		const ch = payload[i];
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === '\\') escaped = true;
			else if (ch === '"') inString = false;
		} else if (ch === '"') inString = true;
		else if (ch === '[') depth++;
		else if (ch === ']' && --depth === 0) return payload.slice(from, i + 1);
	}
	throw new Error('valorventures: the companies array never closes');
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// each push carries one escaped JS string literal; parsing it as a JSON
	// string undoes the escaping, and joining restores the full payload
	const payload = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)]
		.map((m) => JSON.parse(m[1]) as string)
		.join('');

	const marker = '"companies":';
	const at = payload.indexOf(marker);
	if (at < 0) {
		throw new Error('valorventures: no companies array in the page payload');
	}
	const parsed = JSON.parse(
		sliceArray(payload, payload.indexOf('[', at + marker.length))
	) as Company[];

	// each card's detail link, keyed by the company name in its logo alt
	const detailPaths = new Map<string, string>();
	for (const m of html.matchAll(
		/<a[^>]*href="(\/portfolio\/[^"]+)"[^>]*>[\s\S]{0,2000}?<img[^>]*alt="([^"]*)"/g
	)) {
		if (m[2]) detailPaths.set(m[2], m[1]);
	}

	const companies: ScrapedCompany[] = [];
	for (const c of parsed) {
		const name = (c.name ?? '').trim();
		if (!name || c.published === false) continue;

		// the free-text tags field is sometimes stuffed with seo keywords
		// ("Miami Venture Capital", the fund's own name); the structured
		// industries list is the clean sector labelling where it is filled in
		const sectors =
			c.industries && c.industries.length > 0 ? c.industries : (c.tags ?? '').split(',');
		const category = [
			...sectors.map((s) => s.trim()),
			// the "Exited" ribbon on the card
			/exited/i.test(c.status ?? '') ? 'Exited' : ''
		]
			.filter(Boolean)
			.join(', ');

		let url = (c.website ?? '').trim();
		if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
		// a company with no website of its own points at its page on valor.vc
		if (!url) {
			const path = detailPaths.get(name);
			if (path) url = `${BASE_URL}${path}`;
		}

		companies.push({ name, category, url });
	}

	if (companies.length === 0) {
		throw new Error('valorventures: no companies in the page payload');
	}

	return companies;
}
