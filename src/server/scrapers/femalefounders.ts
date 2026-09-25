import type { ScrapedCompany } from './types';

const BASE_URL = 'https://femalefoundersfund.com';
const PAGE_URL = `${BASE_URL}/portfolio/`;
// the site's firewall turns a browser user agent away with a 403 once it has
// seen a few requests from an address, and answers a request that says
// plainly who is asking, as okapi's and frist cressey's do
const OWN_UA = 'portfolio-alert/1.0 (+https://portfolio-alert.vercel.app)';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own, behind a firewall that closes its rest api. the
// portfolio page is a grid of cards, each a logo and the founders' names —
// never the company's — linking the company's page on the fund's site, with
// the sectors the page's filter reads as a data attribute and a badge on the
// ones sold ("acquired"). the company's page names it in its title ("Billie
// - Female Founders Fund") and links its site from an "About Billie" button;
// those pages are asked for one at a time, a pause between them, and a page
// that will not load leaves its company named after its address on the
// fund's site and linking there.

const CARD = /(?=<div class="portfolio" data-filter=)/;
const FILTER = /^<div class="portfolio" data-filter="([^"]*)"/;
const PAGE = /<a class="portfolio-link" href="([^"]+)"/;
const BADGE = /class="portfolio-badge"[^>]*>\s*<span>([\s\S]*?)<\/span>/;
const TITLE = /<title>([\s\S]*?)<\/title>/;
const SITE = /<a class="btn" href="(https?:\/\/[^"]+)"[^>]*>\s*About\b/i;
const STEALTH = /^stealth\b/i;
const PACE_MS = 150;
const RETRY_DELAY_MS = 20_000;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// asked for as portfolio alert first, as a browser should the firewall change
// its mind about who it lets in
async function get(url: string): Promise<Response> {
	let resp = await fetch(url, { headers: { 'User-Agent': OWN_UA } });
	if (resp.status === 403) resp = await fetch(url, { headers: { 'User-Agent': UA } });
	return resp;
}

// "831-stories" -> "831 Stories", for a page that will not load
const slugName = (page: string) =>
	(page.match(/\/portfolio\/([^/?#]+)\/?/)?.[1] ?? '')
		.split('-')
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');

// what a company's page says: its name and its site
async function pageOf(page: string): Promise<{ name: string; site: string } | null> {
	try {
		let resp = await get(page);
		if (resp.status === 429) {
			await wait(RETRY_DELAY_MS);
			resp = await get(page);
		}
		if (!resp.ok) return null;
		const html = await resp.text();
		const name = clean(html.match(TITLE)?.[1] ?? '').replace(/\s+[-–|]\s+Female Founders Fund\s*$/i, '');
		return { name, site: unescape(html.match(SITE)?.[1] ?? '') };
	} catch {
		return null;
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await get(PAGE_URL);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const cards: { page: string; sectors: string[]; badge: string }[] = [];
	const pages = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const page = unescape(card.match(PAGE)?.[1] ?? '');
		if (!page || pages.has(page)) continue;
		pages.add(page);
		cards.push({
			page,
			sectors: (card.match(FILTER)?.[1] ?? '')
				.split(',')
				.map(tag)
				.filter(Boolean),
			badge: clean(card.match(BADGE)?.[1] ?? '')
		});
	}
	if (cards.length === 0) {
		throw new Error('femalefounders: no companies on the portfolio page');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [i, card] of cards.entries()) {
		if (i > 0) await wait(PACE_MS);
		const found = await pageOf(card.page);
		const name = found?.name || slugName(card.page);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		// "acquired" -> "Acquired", with the Exited tag
		const badge = card.badge ? card.badge[0].toUpperCase() + card.badge.slice(1) : '';
		companies.push({
			name,
			category: [...card.sectors, badge, /^(acquired|exited|ipo|merged)/i.test(badge) ? 'Exited' : '']
				.filter((t, k, all) => t && all.indexOf(t) === k)
				.join(', '),
			url: found?.site || card.page
		});
	}

	return companies;
}
