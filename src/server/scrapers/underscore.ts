import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://underscore.vc/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page is a grid of cards, every company in the
// page, each filed under the sectors the page filters by ("Vertical SaaS",
// "AI/ML") and an "ACQUIRED" badge on the ones the fund is out of. a card
// opens a panel giving the company's name, its links — its site, or only
// its linkedin and the like — its founders, its co-investors and, for an
// exit, "Acquired by: WHOOP". the sectors are kept as tags, a buyer as
// "Acquired by …" with the Exited tag; "Portfolio Spotlight", the page's
// pick of companies, is no sector and is not kept. a company that links no
// site of its own links the portfolio.

const CARD = /(?=<div class="col-lg-3 col-md-4 col-sm-6 mix\b)/;
const SECTORS = /^<div class="col-lg-3 col-md-4 col-sm-6 mix\b([^"]*)"/;
// the page's names for the sectors: a radio button and its label
const FILTER = /<input type="radio"[^>]*\bid="([^"]+)"[^>]*\bvalue="\.\1"[^>]*>\s*<label for="\1">([\s\S]*?)<\/label>/g;
const NAME = /<h5 class="title">([\s\S]*?)<\/h5>/;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="icon-link"/;
const ACQUIRED = /class="aquired-notice"/;
const BUYER_LINE = /<p>((?:(?!<\/?p>)[\s\S])*?Acquired by:[\s\S]*?)<\/p>/i;
const BUYER = /acquired by:\s*(.+)$/i;
const NOT_SECTORS = /^(?:portfolio-spotlight|all)$/i;
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
	const labels = new Map([...html.matchAll(FILTER)].map(([, slug, label]) => [slug, tag(label)]));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const sectors = (card.match(SECTORS)?.[1] ?? '')
			.split(/\s+/)
			.filter((slug) => slug && !NOT_SECTORS.test(slug))
			.map((slug) => labels.get(slug) ?? slug);
		const buyer = clean(card.match(BUYER_LINE)?.[1] ?? '').match(BUYER)?.[1];
		const out = ACQUIRED.test(card) || !!buyer;
		const site = unescape(card.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [...sectors, buyer ? `Acquired by ${tag(buyer)}` : '', out ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('underscore: no companies on the portfolio page — the markup moved');
	}

	return companies;
}
