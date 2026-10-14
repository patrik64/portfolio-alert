import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.reflexcapital.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the investments page is a grid of logos, the whole of it in
// the page, a logo opening a panel with a few lines about the company and a
// button to its site that names it ("Visit Product Fruits"); the logos have
// no alt text, so the name is the button's. a company the fund is out of
// carries an "Exit" mark on its logo. a button naming no company ("Visit
// website") leaves its company out. an exit is kept with the Exited tag;
// the page gives no sectors or years.

const CELL = /(?=<div class="cell">)/;
const BUTTON = /<a class="button" href="([^"]*)"[^>]*>\s*Visit\s+([\s\S]*?)<\/a>/;
const EXIT = /<sup>\s*Exit\s*<\/sup>/i;
const GENERIC = /^(?:the\s+)?(?:website|site|web|homepage|page)$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const cell of html.split(CELL).slice(1)) {
		const button = cell.match(BUTTON);
		const name = clean(button?.[2] ?? '');
		if (!name || GENERIC.test(name) || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unescape(button?.[1] ?? '').trim();
		if (/^https?:\/\//i.test(site)) withSite++;
		companies.push({
			name,
			category: EXIT.test(cell) ? 'Exited' : '',
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('reflex: no companies in the investments grid — the markup moved');
	}
	if (withSite === 0) {
		throw new Error("reflex: no company's button links its site — the grid's markup moved");
	}

	return companies;
}
