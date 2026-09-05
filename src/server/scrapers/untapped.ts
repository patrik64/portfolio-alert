import type { ScrapedCompany } from './types';

const BASE_URL = 'https://untapped.vc';
const LIST_URL = `${BASE_URL}/api/portfolio-companies`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the site is a react app that renders the portfolio on its front page from
// its own json endpoint — the served html is an empty shell, and every path it
// does not know answers with that same shell, so a body that parses as json is
// how the endpoint tells itself apart.
//
// each company comes with an industry and the stage the fund came in at,
// either of which may be left blank.

interface Company {
	name?: string;
	industry?: string;
	stage?: string;
	websiteUrl?: string;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(LIST_URL, {
		headers: { 'User-Agent': UA, Accept: 'application/json' }
	});
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${LIST_URL}: ${resp.status}`);
	}
	const body = await resp.text();
	let rows: Company[];
	try {
		rows = JSON.parse(body) as Company[];
	} catch {
		throw new Error('untapped: the portfolio endpoint no longer answers with json');
	}
	if (!Array.isArray(rows)) {
		throw new Error('untapped: the portfolio endpoint no longer answers with a list');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of rows) {
		const name = (row.name ?? '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: [(row.industry ?? '').trim(), (row.stage ?? '').trim()].filter(Boolean).join(', '),
			url: (row.websiteUrl ?? '').trim()
		});
	}

	if (companies.length === 0) {
		throw new Error('untapped: no companies in the portfolio feed');
	}

	return companies;
}
