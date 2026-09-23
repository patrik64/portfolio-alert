import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://impactamericafund.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a static page: every company is a card with its logo, its name and a
// sentence about it. the fund files nobody under a sector and links no company
// to its site, so the address stays empty. four names end in "(Exited)" —
// how the investment ended rather than what the company is called — which
// moves to the category.

const CARD = /<li class="card">([\s\S]*?)<\/li>/g;
const NAME = /class="card__name">([\s\S]*?)<\/h3>/;
const EXITED = /\s*\(\s*exited\s*\)\s*$/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;|&rsquo;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
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
	for (const [, card] of html.matchAll(CARD)) {
		const listed = clean(card.match(NAME)?.[1] ?? '');
		const name = listed.replace(EXITED, '').trim();
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: EXITED.test(listed) ? 'Exited' : '', url: '' });
	}

	if (companies.length === 0) {
		throw new Error('impactamerica: no companies on the portfolio page');
	}

	return companies;
}
