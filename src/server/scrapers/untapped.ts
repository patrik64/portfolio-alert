import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://untapped.vc/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// since september 2026 the site is a single page, "an illustrated field
// guide", that renders its complete portfolio directory on the server: a card
// per company naming it, linking its site, and filing it under a category and
// a few tags. the directory states its own size, which the cards are held to.
// (the json endpoint the old react app read is gone.)

const CARD = /(?=<article[^>]*class="[^"]*portfolio-card)/;
const NAME = /<h3>([\s\S]*?)<\/h3>/;
const SITE = /<h3>\s*<a href="(https?:\/\/[^"]+)"/;
const KICKER = /class="kicker">([\s\S]*?)<\//;
const TAG = /<li class="tag">([\s\S]*?)<\/li>/g;
const STATED = /Browse the complete portfolio[\s\S]{0,200}?<small>(\d+)\s+companies<\/small>/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;|&rsquo;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		// the category heads the card and is repeated as its first tag
		const tags = [clean(card.match(KICKER)?.[1] ?? ''), ...[...card.matchAll(TAG)].map((m) => clean(m[1]))]
			.filter(Boolean)
			.map((tag) => tag.replace(/\s*,\s*/g, ' / '));
		companies.push({
			name,
			category: [...new Set(tags)].join(', '),
			url: card.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('untapped: no companies in the portfolio directory');
	}
	const stated = Number(html.match(STATED)?.[1] ?? 0);
	if (stated > 0 && companies.length < stated) {
		throw new Error(`untapped: read ${companies.length} of the ${stated} companies the directory lists`);
	}

	return companies;
}
