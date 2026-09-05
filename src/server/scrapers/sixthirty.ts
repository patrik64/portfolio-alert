import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://sixthirty.co/startup-portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress. the cards flip: a logo on the front, and on the back the same
// logo, a description, and a small arrow that links out. the logos carry no alt
// text but that arrow does — "Angle Health link" — which is the only place the
// page writes a company's name.
//
// a card that belongs to a company the fund has exited says so in its class.

const CARD = /(?=<div class="col-xs-10 col-lg-6 col-xl-5 portfolio-card)/;
const CLASS = /^<div class="([^"]*)"/;
const NAME = /alt="([^"]*?) link"/;
const SITE = /<a href="(https?:\/\/[^"]*)"/;
const EXITED = /\bexits\b/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

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
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: EXITED.test(card.match(CLASS)?.[1] ?? '') ? 'Exited' : '',
			url: card.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('sixthirty: no companies on the portfolio page');
	}

	return companies;
}
