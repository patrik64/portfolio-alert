import type { ScrapedCompany } from './types';

const BASE_URL = 'https://femalefoundersfund.com';
const PAGE_URL = `${BASE_URL}/portfolio/`;
// the site's feed of its portfolio posts, ten a page
const FEED_URL = `${BASE_URL}/feed/?post_type=portfolio&paged=`;
const MAX_FEED_PAGES = 40;
// the site's firewall turns a browser user agent away with a 403 once it has
// seen a few requests from an address, and answers a request that says
// plainly who is asking, as okapi's and frist cressey's do
const OWN_UA = 'portfolio-alert/1.0 (+https://portfolio-alert.vercel.app)';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own, behind a firewall that closes its rest api
// to the portfolio. the portfolio page is a grid of cards, each a logo and
// the founders' names — never the company's — linking the company's page on
// the fund's site, with the sectors the page's filter reads as a data
// attribute and a badge on the ones sold ("acquired"). the site's feed of
// its portfolio posts names each company and gives its page, ten a page,
// and is read page by page until it runs out; the grid says which
// companies are listed, the feed names them.
//
// a company's page names it too, in its title ("Billie - Female Founders
// Fund"), and links its site from an "About Billie" button; but asking for
// eighty of those pages a night is what had the firewall turn the fetch
// away, so a page is asked for only when the feed does not name its
// company. every company links its page on the fund's site, and a page
// that will not load leaves its company named after its address there.

const CARD = /(?=<div class="portfolio" data-filter=)/;
const FILTER = /^<div class="portfolio" data-filter="([^"]*)"/;
const PAGE = /<a class="portfolio-link" href="([^"]+)"/;
const BADGE = /class="portfolio-badge"[^>]*>\s*<span>([\s\S]*?)<\/span>/;
const ITEM = /<item>([\s\S]*?)<\/item>/g;
const ITEM_TITLE = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/;
const ITEM_LINK = /<link>\s*([^<\s]+)\s*<\/link>/;
const TITLE = /<title>([\s\S]*?)<\/title>/;
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

// a page or feed of the fund's site; the captcha siteground's firewall puts
// under a 2xx status in front of an address it distrusts, vercel's among
// them some nights, or a refusal, is waited out once, and what answered is
// said
async function load(url: string): Promise<{ ok: boolean; status: number; answer: string; body: string }> {
	let answer = '';
	let status = 0;
	let body = '';
	for (let attempt = 0; attempt < 2; attempt++) {
		if (attempt > 0) await wait(RETRY_DELAY_MS);
		const resp = await get(url);
		status = resp.status;
		body = await resp.text();
		const captcha = /sgcaptcha/i.test(body);
		if (resp.ok && !captcha) return { ok: true, status, answer: '', body };
		answer = `${status}` + (captcha ? ", siteground's captcha" : '');
		// a 404 is an answer, not a mood: not asked for again
		if (status === 404) break;
	}
	return { ok: false, status, answer, body };
}

// the companies' names by their page, from the feed, read until it runs out
async function feedNames(): Promise<Map<string, string>> {
	const names = new Map<string, string>();
	for (let n = 1, perPage = 0; n <= MAX_FEED_PAGES; n++) {
		const { ok, status, body } = await load(`${FEED_URL}${n}`);
		// wordpress answers a page past the feed's last with a 404
		if (!ok && status === 404 && n > 1) break;
		if (!ok) break;
		const items = [...body.matchAll(ITEM)];
		for (const [, item] of items) {
			const link = item.match(ITEM_LINK)?.[1] ?? '';
			const name = clean(item.match(ITEM_TITLE)?.[1] ?? '');
			if (link && name) names.set(link, name);
		}
		if (n === 1) perPage = items.length;
		if (items.length === 0 || items.length < perPage) break;
	}
	return names;
}

// what a company's page says: its name, or nothing when it will not load
async function nameOnPage(page: string): Promise<string> {
	try {
		const { ok, body } = await load(page);
		if (!ok) return '';
		return clean(body.match(TITLE)?.[1] ?? '').replace(/\s+[-–|]\s+Female Founders Fund\s*$/i, '');
	} catch {
		return '';
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const grid = await load(PAGE_URL);
	if (!grid.ok) {
		throw new Error(`femalefounders: ${PAGE_URL} answered ${grid.answer}`);
	}

	const cards: { page: string; sectors: string[]; badge: string }[] = [];
	const pages = new Set<string>();
	for (const card of grid.body.split(CARD).slice(1)) {
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

	const names = await feedNames();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of cards) {
		let name = names.get(card.page) ?? '';
		if (!name) {
			// the feed left this one out: its page names it
			if (companies.length > 0) await wait(PACE_MS);
			name = (await nameOnPage(card.page)) || slugName(card.page);
		}
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		// "acquired" -> "Acquired", with the Exited tag
		const badge = card.badge ? card.badge[0].toUpperCase() + card.badge.slice(1) : '';
		companies.push({
			name,
			category: [...card.sectors, badge, /^(acquired|exited|ipo|merged)/i.test(badge) ? 'Exited' : '']
				.filter((t, k, all) => t && all.indexOf(t) === k)
				.join(', '),
			url: card.page
		});
	}

	return companies;
}
