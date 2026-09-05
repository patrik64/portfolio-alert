import type { ScrapedCompany } from './types';

const BASE_URL = 'https://panteracapital.com';
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress on the fund's own theme. the portfolio page ships an empty
// container and the theme fills it from admin-ajax, so the html holds the
// filters and nothing else. the theme asks for the whole portfolio in one
// call, unfiltered and with no nonce, and that is what is asked for here.
//
// a company comes back with the tags the fund files it under, whether it is
// still held, and its site.
//
// the fund also records whether it came in on tokens or on equity. that is the
// shape of the investment rather than anything about the company, so it is
// left out, the way a fund's vehicles are elsewhere.

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a tag written with a comma in it would read
// as two rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// the status of a company the fund still holds. the field is a slug rather
// than something the fund prints, so "exited" is capitalised to read as the
// tag it becomes — the names are left exactly as the fund writes them, since
// a lowercase 0x or 1inch is the brand
const HELD = /^active$/i;
const asTag = (status: string) => status.replace(/^[a-z]/, (c) => c.toUpperCase());

interface Row {
	data?: {
		title?: string;
		status?: string;
		cta?: { url?: string };
		tags?: { name?: string }[];
	};
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(AJAX_URL, {
		method: 'POST',
		headers: {
			'User-Agent': UA,
			'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
			'X-Requested-With': 'XMLHttpRequest'
		},
		body: new URLSearchParams({ action: 'getAllPosts' })
	});
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${AJAX_URL}: ${resp.status}`);
	}

	let rows: Row[];
	try {
		rows = (await resp.json()) as Row[];
	} catch {
		throw new Error('pantera: the portfolio came back in a shape that could not be read');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of rows) {
		const name = clean(row.data?.title ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const status = clean(row.data?.status ?? '');
		companies.push({
			name,
			category: [
				...(row.data?.tags ?? []).map((t) => tag(t.name ?? '')),
				HELD.test(status) ? '' : asTag(tag(status))
			]
				.filter(Boolean)
				.join(', '),
			url: clean(row.data?.cta?.url ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('pantera: no companies in the portfolio');
	}

	return companies;
}
