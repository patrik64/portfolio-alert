import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.visiblehands.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/\s+/g, ' ')
		.trim();

// the page is one static webflow list of founder cards (class "team__item",
// left over from the template) — the finsweet cmsfilter chips filter in the
// browser, there is no pagination wrapper. each card names the founder and
// their company plus the three filter fields: a nested category list, the city
// and the accelerator cohort. nothing links out: the fund publishes no company
// websites and no per-company pages, so every url is empty. an exit is written
// into the company name itself ("… - Acquired by The Beans").

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split('class="team__item w-dyn-item"').slice(1)) {
		// the last chunk trails into the footer; only the card's own fields matter
		const card = item.split('class="team__item w-dyn-item"')[0];
		const raw = decode(card.match(/class="portfolio__company">([^<]*)</)?.[1] ?? '');
		if (!raw) continue;
		const acquired = / - Acquired by .+$/i.test(raw);
		const name = raw.replace(/ - Acquired by .+$/i, '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);

		const tags = [
			...[...card.matchAll(/class="portfolio__category">([^<]*)</g)].map((m) => decode(m[1])),
			decode(card.match(/fs-cmsfilter-field="location"[^>]*>([^<]*)</)?.[1] ?? ''),
			decode(card.match(/fs-cmsfilter-field="program"[^>]*>([^<]*)</)?.[1] ?? ''),
			acquired ? 'Acquired' : ''
		].filter(Boolean);

		companies.push({ name, category: tags.join(', '), url: '' });
	}

	if (companies.length === 0) {
		throw new Error('visiblehands: no companies on the portfolio page');
	}

	return companies;
}
