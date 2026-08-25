import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://entreecap.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#39;|&#8217;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/\s+/g, ' ')
		.trim();

// the companies page (WordPress) server-renders every card: the name in the
// title anchor, labeled Sector and Website fields, and Exit/IPO/TGE tags in
// the card's tag container

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	for (const card of html.split('<div class="card-co slide-up-down"').slice(1)) {
		const name = decode(
			(card.match(/card-co__title">\s*<a[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? '').replace(/<[^>]+>/g, '')
		);
		if (!name) continue;
		const sector = decode(
			(card.match(/card-co__param -fw700">Sector<\/div>\s*<div class="card-co__value">([\s\S]*?)<\/div>/)?.[1] ?? '').replace(/<[^>]+>/g, '')
		);
		// each tag renders twice per card (desktop and mobile), so dedupe
		const tags = [
			...new Set([...card.matchAll(/card-co__tag[^"]*">\s*([^<]{0,30}?)\s*</g)].map((m) => decode(m[1])).filter(Boolean))
		];
		const url =
			card.match(/card-co__param -fw700">Website<\/div>\s*<div class="card-co__value">\s*<a href="([^"]+)"/)?.[1] ?? '';
		companies.push({
			name,
			category: [sector, ...tags].filter(Boolean).join(', '),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('entree: no companies found on the companies page');
	}

	return companies;
}
