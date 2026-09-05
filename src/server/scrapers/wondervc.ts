import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://wondervc.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// server-rendered wordpress: the portfolio is an "elastic portfolio" grid whose
// filter bar maps each category slug to its label (".space-tech" -> "Space &
// Deep Tech"), and every card carries its slugs in data-project-cat. the whole
// grid is rendered twice — once per breakpoint — so cards dedupe on name.
//
// the card's <h3> names the company; the logo filename does not (WhatNot's is
// "Field-Complete.png"), so it is never read. "exited" is one of the filter
// slugs, and always lands as the final tag.

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const labels = new Map<string, string>();
	for (const m of html.matchAll(/data-filter="\.([\w-]+)"[^>]*>([^<]*)</g)) {
		labels.set(m[1], m[2].trim());
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split('<div class="col elastic-portfolio-item').slice(1)) {
		const name = (card.match(/<h3>([^<]*)<\/h3>/)?.[1] ?? '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		const tags = (card.match(/data-project-cat="([^"]*)"/)?.[1] ?? '')
			.split(/\s+/)
			.filter(Boolean)
			.map((slug) => labels.get(slug) ?? slug)
			.sort((a, b) => Number(a === 'Exited') - Number(b === 'Exited'));
		// one link is written without a scheme ("houseaccount.com"), the way the
		// browser's address bar would take it
		const href = (card.match(/<a href="([^"]*)"><\/a>/)?.[1] ?? '').trim();
		const url = /^https?:\/\//i.test(href)
			? href
			: /^[\w-]+(\.[\w-]+)+/.test(href)
				? `https://${href}`
				: '';
		companies.push({ name, category: tags.join(', '), url });
	}

	if (companies.length === 0) {
		throw new Error('wondervc: no companies on the portfolio page');
	}

	return companies;
}
