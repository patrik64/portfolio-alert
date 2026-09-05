import type { ScrapedCompany } from './types';

const DATA_URL = 'https://www.meruscap.com/page-data/portfolio/page-data.json';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// gatsby over sanity, which means the page it renders is also served as the
// json it was built from, one document holding all sixty-two companies. that
// is read rather than the markup.
//
// the fund says of each what it does, in a phrase rather than a label — AI for
// Manufacturing Operations, Web Isolation Platform — and that is prose, so it
// is left where it is. what it does file is what became of a company, and it
// is worth keeping in its own words: twenty-four say Acquired and one says
// Nasdaq: AMPL, which says both that the company listed and where.
//
// eleven companies have no address, most of them long since bought, and they
// keep none rather than a link to the buyer.

const COMPANY_LIST = 'partners';

interface Company {
	title?: string;
	status?: string | null;
	link?: string | null;
}
interface PageData {
	result?: { data?: { sanityPortfolio?: { [list: string]: Company[] } } };
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(DATA_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${DATA_URL}: ${resp.status}`);
	}
	const page = (await resp.json()) as PageData;

	const listed = page.result?.data?.sanityPortfolio?.[COMPANY_LIST];
	if (!listed) {
		throw new Error(`merus: the portfolio page no longer holds its ${COMPANY_LIST}`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const company of listed) {
		const name = clean(company.title ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: clean(company.status ?? ''),
			url: clean(company.link ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('merus: no companies in the portfolio');
	}

	return companies;
}
