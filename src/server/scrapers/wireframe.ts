import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.wireframevc.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow: every card is in the html at once (the filters are
// client-side and the list carries no pagination). a card names the company,
// the round the fund came in at and the month, links the company's site, and
// carries a small tag list — "Exit" for a company that has left, "Prior" for
// one backed at a prior firm. most cards have no tags at all, and their tag
// list renders as webflow's empty state.

const NAME = /class="h-portfolio-item__name">([^<]*)</;
const STAGE = /class="t-portfolio-item__stage">([^<]*)</;
const SITE = /<a href="(https?:\/\/[^"]+)"[^>]*class="btn-special is--portfolio-item/;
const TAG = /class="c-tag-col-item w-dyn-item"[\s\S]{0,200}?<div[^>]*>([^<]{1,30})<\/div>/g;

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split('class="overview-portfolio__item w-dyn-item"').slice(1)) {
		const name = (card.match(NAME)?.[1] ?? '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);

		const tags = [(card.match(STAGE)?.[1] ?? '').trim()];
		for (const m of card.matchAll(TAG)) {
			// the site writes the exit as "Exit"
			const tag = m[1].trim();
			if (tag) tags.push(tag === 'Exit' ? 'Exited' : tag);
		}

		companies.push({
			name,
			category: tags
				.filter(Boolean)
				.sort((a, b) => Number(a === 'Exited') - Number(b === 'Exited'))
				.join(', '),
			url: card.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('wireframe: no companies on the portfolio page');
	}

	return companies;
}
