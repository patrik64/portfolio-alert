import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.horizonsventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js on vercel, drawing from contentful: the page renders its grid in the
// browser, but it arrives with the whole portfolio in its __NEXT_DATA__ — a
// record per company with its name, its site, the date the fund invested and
// the country (or countries) it works from. the category is the country and
// the year of the investment.

const NEXT_DATA = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

interface Company {
	fields?: {
		companyName?: string;
		website?: string;
		investmentDate?: string;
		country?: string[] | string;
	};
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const raw = (await resp.text()).match(NEXT_DATA)?.[1];
	if (!raw) {
		throw new Error('horizons: the page carried no __NEXT_DATA__ — the site moved off next.js');
	}
	const listed = (JSON.parse(raw) as { props?: { pageProps?: { portfolioCompanies?: Company[] } } }).props
		?.pageProps?.portfolioCompanies;
	if (!Array.isArray(listed)) {
		throw new Error('horizons: the page data holds no portfolio companies — the props moved');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const { fields = {} } of listed) {
		const name = clean(fields.companyName ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const countries = Array.isArray(fields.country) ? fields.country : fields.country ? [fields.country] : [];
		const year = (fields.investmentDate ?? '').match(/^(\d{4})-/)?.[1];
		companies.push({
			name,
			category: [...countries.map(tag), year ? `Invested ${year}` : ''].filter(Boolean).join(', '),
			url: clean(fields.website ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('horizons: no companies in the portfolio data');
	}

	return companies;
}
