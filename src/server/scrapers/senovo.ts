import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://senovo.vc/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page is two grids of logos, the active portfolio
// and the exits, the whole of it in the page, a logo a company with a card
// kept beside it giving its name, what it does ("Industrial Text
// Recognition"), the year the fund invested — the year runs after each
// company's founding — the countries it works from, the partner on it and
// its links. what it does, the countries and the year are kept as tags, an
// exit with the Exited tag.

const EXITS = 'class="headline hl_exits"';
const CARD = /<div class="copy_me hidden">([\s\S]*?)<\/div><\/div>/g;
const FIELD = (name: string) => new RegExp(`class="${name}">([\\s\\S]*?)</(?:div|h2)>`);
const SITE = /<a class="www" href="([^"]*)"/;
const YEAR = /\b(?:19|20)\d{2}\b/;
const UNSAID = /^(?:-|other|others|all|n\/a|remote first)$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const split = html.indexOf(EXITS);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const match of html.matchAll(CARD)) {
		const card = match[1];
		const field = (name: string) => clean(card.match(FIELD(name))?.[1] ?? '');
		const name = field('name');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const year = field('year').match(YEAR)?.[0];
		const site = unescape(card.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				tag(field('text')),
				...field('offices').split(',').map(tag),
				year ? `Invested ${year}` : '',
				split >= 0 && (match.index ?? 0) > split ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('senovo: no companies on the portfolio page — the markup moved');
	}

	return companies;
}
