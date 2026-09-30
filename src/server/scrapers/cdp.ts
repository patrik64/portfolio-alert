import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.cdpventurecapital.it/en/portfolio.page';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a cms of its own: the portfolio page holds every card at once and pages
// through them in the browser. a card is either a direct investment or a
// fund the firm backs ("Supported Funds"), which are left out, and carries
// as data its sector ("Clean Tech", "Other", which says nothing and is
// dropped, with "tecnologiaAi" for the ones working in AI), the vehicle it
// came through and the italian region it is in ("Altro" for elsewhere);
// its front has the name and its back a link to the site. one card, filed
// under the vehicle "test", is the cms's own test entry and is left out.
// nothing marks an exit.

const CARD = /(?=<div\b[^>]*\bclass="blocks-portfolio__card-wrapper\b)/;
const DATA = /^<div\b([^>]*)>/;
const ATTR = /\bdata-(category|veicolo|settore|regione)="([^"]*)"/g;
const NAME = /<h4\b[^>]*>([\s\S]*?)<\/h4>/;
const SITE = /<a\b[^>]*\bhref="([^"]*)"/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
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
	for (const card of html.split(CARD).slice(1)) {
		const data = new Map(
			[...(card.match(DATA)?.[1] ?? '').matchAll(ATTR)].map(([, key, value]) => [key, clean(value)])
		);
		if (data.get('category') !== 'InvestimentoDiretto' || /^test$/i.test(data.get('veicolo') ?? '')) continue;
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const sectors = (data.get('settore') ?? '')
			.split(',')
			.map((s) => s.trim())
			.map((s) => (/^tecnologiaai$/i.test(s) ? 'AI' : s))
			.filter((s) => s && !/^other$/i.test(s));
		const region = data.get('regione') ?? '';
		const site = unescape(card.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [...sectors, /^altro$/i.test(region) ? '' : region]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('cdp: no direct investments on the portfolio page');
	}

	return companies;
}
