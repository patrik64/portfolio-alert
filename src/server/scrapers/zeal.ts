import type { ScrapedCompany } from './types';

const PAGE_DATA_URL = 'https://www.zealcapitalpartners.com/page-data/portfolio/page-data.json';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the site is a Gatsby build over Strapi: the portfolio page's data file
// carries a card per company — the name in its section title, the site behind
// a "Visit Website" button, and tags mixing sectors with Zeal's own fund
// vehicles ("Zeal I", "BPI - Pre Seed"), which say nothing about the company

interface Card {
	LSectionTitle?: { title?: string };
	button?: { text?: string; link?: { href?: string } };
	tags?: { name?: string }[];
}

function* findCards(node: unknown): Generator<Card> {
	if (Array.isArray(node)) {
		for (const item of node) yield* findCards(item);
	} else if (node && typeof node === 'object') {
		const card = node as Card;
		if (card.button?.text === 'Visit Website') yield card;
		for (const value of Object.values(node)) yield* findCards(value);
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_DATA_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_DATA_URL}: ${resp.status}`);
	}
	const data = (await resp.json()) as unknown;

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of findCards(data)) {
		const name = (card.LSectionTitle?.title ?? '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: (card.tags ?? [])
				.flatMap((t) => {
					const tag = (t.name ?? '').trim();
					return tag && !/^(zeal|bpi)\b/i.test(tag) ? [tag] : [];
				})
				.join(', '),
			url: card.button?.link?.href ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('zeal: no companies in the portfolio page data');
	}

	return companies;
}
