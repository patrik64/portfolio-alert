import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.activecapitalcompany.com';
const PAGE_URL = `${BASE_URL}/?scroll-to=portfolio`;
const API_URL = 'https://api.activecapitalcompany.nl/graphql';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// gatsby, over a strapi of the fund's own: the home page's portfolio, two
// tabs, "Current investments" and "Divested", is drawn from the fund's
// graphql api once the page has loaded, and asked for here the way the page
// asks, the active companies in the fund's order, with the company's site
// and the date the fund bought it, kept as "Invested 2019". a divested one
// is one the fund is out of. the date it was sold is left alone: the api
// fills it in for companies the fund still holds.

const QUERY = `{
	portfolioens(where: { active: true }, sort: "position:asc") {
		company_name
		category
		company_website
		aquired
		slug
	}
}`;
const STEALTH = /^stealth\b/i;

interface Portfolio {
	company_name?: string;
	category?: string;
	company_website?: string;
	aquired?: string;
	slug?: string;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(API_URL, {
		method: 'POST',
		headers: { 'User-Agent': UA, 'Content-Type': 'application/json' },
		body: JSON.stringify({ query: QUERY })
	});
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${API_URL}: ${resp.status}`);
	}
	const json = (await resp.json()) as { data?: { portfolioens?: Portfolio[] }; errors?: { message?: string }[] };
	if (json.errors?.length) {
		throw new Error(`activecapital: graphql says ${json.errors.map((e) => e.message).join('; ')}`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const portfolio of json.data?.portfolioens ?? []) {
		const name = (portfolio.company_name ?? '').replace(/\s+/g, ' ').trim();
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const divested = /^divested$/i.test(portfolio.category ?? '');
		const invested = (portfolio.aquired ?? '').match(/^(?:19|20)\d{2}/)?.[0];
		// "www.lantor.com" -> "https://www.lantor.com"
		const written = (portfolio.company_website ?? '').trim();
		const site = !written ? '' : /^https?:\/\//i.test(written) ? written : `https://${written}`;
		companies.push({
			name,
			category: [invested ? `Invested ${invested}` : '', divested ? 'Divested' : '', divested ? 'Exited' : '']
				.filter(Boolean)
				.join(', '),
			url: site || (portfolio.slug ? `${BASE_URL}/portfolio/?${portfolio.slug}` : PAGE_URL)
		});
	}
	if (companies.length === 0) {
		throw new Error('activecapital: the api lists no companies');
	}

	return companies;
}
