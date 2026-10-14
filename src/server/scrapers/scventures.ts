import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.sc-ventures.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a static page: south central ventures' portfolio is a grid of cards, the
// whole of it in the page, a card a company with its logo named in its alt
// text and linking its site, a line about it and its sector ("AdTech",
// "Business/Productivity Software"); a company the fund is out of carries a
// badge the stylesheet writes "Exited". a name is now and then the
// company's registered one ("Alchemy Cloud Inc."); the legal form is not
// part of it. the sector is kept as a tag, an exit with the Exited tag.

const CARD = /(?=<div class="element-item\b)/;
const LOGO = /<div class="portfolio-img">[\s\S]*?<a href="([^"]*)"[^>]*>\s*<img\b[^>]*\balt="([^"]*)"/;
// empty in the page, the stylesheet writing it "Exited"
const EXITED = /<span class="portfolio-tag">/;
const SECTORS = /<ul>([\s\S]*?)<\/ul>/;
const SECTOR = /<li>([\s\S]*?)<\/li>/g;
const FORM = /[\s,]+(?:inc\.?|llc|ltd\.?|limited|corp\.?|gmbh|d\.o\.o\.?)$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
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

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const card of html.split(CARD).slice(1)) {
		const [, href = '', alt = ''] = card.match(LOGO) ?? [];
		const written = clean(alt);
		const name = written.replace(FORM, '').trim() || written;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unescape(href).trim();
		if (/^https?:\/\//i.test(site)) withSite++;
		companies.push({
			name,
			category: [
				...[...(card.match(SECTORS)?.[1] ?? '').matchAll(SECTOR)].map(([, sector]) => tag(sector)),
				EXITED.test(card) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('scventures: no companies in the portfolio grid — the markup moved');
	}
	if (withSite === 0) {
		throw new Error("scventures: no company links its site — the cards' markup moved");
	}

	return companies;
}
