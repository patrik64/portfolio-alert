import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.voloearth.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// every card ships in the static html — the focus-area buttons are a jetboost
// client-side filter, not pagination, and the pagination wrapper is absent.
// each card carries a hidden lightbox holding the company name, its website and
// up to two tags (the focus area plus an "Acquired" marker); an unused tag slot
// is w-condition-invisible, so only bare catgeory-heading elements count. one
// card is a nameless "Stealth" placeholder.

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split('class="portfolio-item w-dyn-item"').slice(1)) {
		const name = (item.match(/class="heading-3">([^<]*)</)?.[1] ?? '').replace(/\s+/g, ' ').trim();
		if (!name || /^stealth$/i.test(name) || seen.has(name)) continue;
		seen.add(name);

		const tags = [...item.matchAll(/class="catgeory-heading">([^<]*)</g)]
			.map((m) => m[1].trim())
			.filter(Boolean);
		// the link is w-dyn-bind-empty (href="#") when no site is on file
		const site = item.match(/<a href="(https?:\/\/[^"]+)"[^>]*class="website-link"/)?.[1];
		companies.push({ name, category: tags.join(', '), url: site ?? '' });
	}

	if (companies.length === 0) {
		throw new Error('voloearth: no companies on the portfolio page');
	}

	return companies;
}
