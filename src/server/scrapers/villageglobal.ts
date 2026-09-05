import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.villageglobal.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow. the cards sit under the site's own "portfoloio" typo, and every one
// of them ships in the html — the pagination wrapper is drawn but left empty.
//
// a card prints no name: the fund writes it as the alt text on the logo, which
// is the only place it appears. the tags a card nests are the fund's own
// categories, except for an "All" the fund hides on every company so that its
// filter has something to match on — that one is drawn invisible and is left
// out. an exited company wears a small badge image inside its link.

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split('class="portfoloio-collection-items w-dyn-item"').slice(1)) {
		const name = (
			item.match(/class="company-logo-wrapper"[\s\S]*?<img[^>]*\balt="([^"]*)"/)?.[1] ?? ''
		).trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		const tags = [...item.matchAll(/class="reference-wrapper([^"]*)"[\s\S]*?class="categories">([^<]*)</g)]
			.filter((m) => !m[1].includes('w-condition-invisible'))
			.map((m) => m[2].trim())
			.filter(Boolean);
		if (/<img src="[^"]*exited[^"]*"/i.test(item)) tags.push('Exited');
		companies.push({
			name,
			category: tags.join(', '),
			url: item.match(/<a href="(https?:\/\/[^"]+)"[^>]*class="company-details/)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('villageglobal: no companies on the portfolio page');
	}

	return companies;
}
