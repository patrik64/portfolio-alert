import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://vtfcapital.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// server-rendered wordpress (Qode portfolio): the filter bar maps
// portfolio_category_<id> classes to labels ("Commerce", "Exited"), and each
// <article class="mix portfolio_category_... "> card carries the company site
// and name in its portfolio_title anchor. an item's categories come from its
// class list; "Exited" always sorts last so it lands as the final tag.

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const labels = new Map<string, string>();
	for (const m of html.matchAll(
		/data-filter="(portfolio_category_\d+)">\s*<span>([^<]*)<\/span>/g
	)) {
		labels.set(m[1], m[2].trim());
	}

	const companies: ScrapedCompany[] = [];
	for (const m of html.matchAll(
		/<article class="mix ([^"]*)"[\s\S]*?<h5 itemprop="name" class="portfolio_title entry_title"><a itemprop="url" href="([^"]*)"[^>]*>([^<]*)<\/a><\/h5>/g
	)) {
		const tags = (m[1].match(/portfolio_category_\d+/g) ?? [])
			.map((c) => labels.get(c) ?? '')
			.filter(Boolean)
			.sort((a, b) => Number(a === 'Exited') - Number(b === 'Exited'));
		const name = m[3].trim();
		if (name) companies.push({ name, category: tags.join(', '), url: m[2] });
	}

	if (companies.length === 0) {
		throw new Error('vtfcapital: no companies on the page');
	}

	return companies;
}
