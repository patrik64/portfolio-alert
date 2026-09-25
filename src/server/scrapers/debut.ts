import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://debutcapital.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js over strapi: the portfolio page carries its data in the
// __NEXT_DATA__ script, a record per company — the name as a headline, the
// category the fund files it under as a subtitle ("Beauty"), a line about
// it and a link to its site. a company without a link stays with the
// page. nothing marks an exit.

const NEXT_DATA = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;
const STEALTH = /^stealth\b/i;

interface Record_ {
	company?: { headline?: string; subtitle?: string };
	href?: string | null;
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
		throw new Error('debut: the portfolio page carries no data');
	}
	const data = JSON.parse(json) as { props?: { pageProps?: { portfolioCompanies?: Record_[] } } };
	const records = data.props?.pageProps?.portfolioCompanies ?? [];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const record of records) {
		const name = clean(record.company?.headline ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: tag(record.company?.subtitle ?? ''),
			url: clean(record.href ?? '').replace(/^(?=[\w-]+(\.[\w-]+)+)/, 'https://') || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('debut: no companies in the portfolio page data');
	}

	return companies;
}
