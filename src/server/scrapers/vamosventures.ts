import type { ScrapedCompany } from './types';

const BASE_URL = 'https://vamosventures.com';
const PAGE_URL = `${BASE_URL}/portfolio/`;
// the rss feed of the companies post type, ten a page
const FEED_URL = `${BASE_URL}/feed/?post_type=companies`;
const MAX_PAGES = 40;
// a feed page that answers html is asked once more after this
const CHALLENGED_MS = 10_000;

// the host's WAF answers 403 to Chrome user agents — the shared Chrome string
// the other scrapers send is refused on every path while Safari, Firefox and
// even a bare "curl/8.4.0" are served normally. hence a Safari UA here; it is
// still sent on every request.
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

// wordpress + Elementor: the portfolio is an Elementor loop over a "companies"
// post type, rendered twice (desktop and mobile grids) into 60 cards for 30
// companies. a card carries no company name — only a logo image with an empty
// alt, a tagline, the founders, the sector as a button that leads nowhere
// ("Health and Wellness") and the outbound link to the company's own site —
// but Elementor stamps it with the post's id ("e-loop-item-3251"). the names
// come from the post type's rss feed, ten a page, each item's guid carrying
// the same id, so the two are joined on it. the cards say which companies are
// listed; a feed item without a card is not on the page and is left out.
//
// the feed is read rather than the rest api because the WAF answers the rest
// api with a challenge page — status 200, body html — for a datacenter
// address, while the feed is an ordinary page of the site. a feed page that
// answers html all the same is asked once more after a pause, then the night
// is given up with a clear word instead of a parse error.

const CARD = /e-loop-item-(\d+) post-\d+ companies/;
const LINK = /href="(https?:\/\/[^"]*)"/g;
// the sector: the one button on a card that leads nowhere
const SECTOR =
	/<a class="elementor-button elementor-button-link elementor-size-sm" href="#">[\s\S]*?<span class="elementor-button-text"><span>([^<]*)<\/span>/g;
const ITEM = /<item>([\s\S]*?)<\/item>/g;
// <guid isPermaLink="false">https://vamosventures.com/?post_type=companies&#038;p=3251</guid>
const GUID_ID = /<guid[^>]*>[^<]*[?&](?:amp;|#0?38;)?p=(\d+)/;
const FIELD = (name: string) => new RegExp(`<${name}>([\\s\\S]*?)</${name}>`);
const CDATA = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/;

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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA, Referer: PAGE_URL } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

// a feed page's items, or nothing past the feed's last page, which wordpress
// answers with a 404
async function feedItems(page: number): Promise<string[] | undefined> {
	const url = page === 1 ? FEED_URL : `${FEED_URL}&paged=${page}`;
	for (let attempt = 0; ; attempt++) {
		const resp = await fetch(url, { headers: { 'User-Agent': UA, Referer: PAGE_URL } });
		if (resp.status === 404 && page > 1) {
			await resp.body?.cancel();
			return undefined;
		}
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const body = await resp.text();
		if (/<rss\b/i.test(body)) return [...body.matchAll(ITEM)].map(([, item]) => item);
		if (attempt >= 1) {
			throw new Error('vamosventures: the feed answered a challenge page, not rss');
		}
		await wait(CHALLENGED_MS);
	}
}

const field = (item: string, name: string) =>
	clean((item.match(FIELD(name))?.[1] ?? '').replace(CDATA, '$1'));

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);

	// each card by its post id: the company's site and sector, the first card
	// of a company standing for both grids
	const cards = new Map<string, { site: string; category: string }>();
	const parts = html.split(CARD);
	for (let i = 1; i < parts.length; i += 2) {
		const id = parts[i];
		if (cards.has(id)) continue;
		const card = parts[i + 1];
		const site =
			[...card.matchAll(LINK)].map(([, href]) => href).find((href) => !href.includes('vamosventures.com')) ??
			'';
		const category = [...card.matchAll(SECTOR)]
			.flatMap(([, label]) => clean(label).split(','))
			.map(tag)
			.filter((t, i, all) => t && all.indexOf(t) === i)
			.join(', ');
		cards.set(id, { site, category });
	}
	if (cards.size === 0) {
		throw new Error('vamosventures: no company cards on the portfolio page — the markup moved');
	}

	// the whole feed, a page at a time; a part of it must not pass for the whole
	const items: string[] = [];
	for (let page = 1; page <= MAX_PAGES; page++) {
		const found = await feedItems(page);
		if (!found || found.length === 0) break;
		items.push(...found);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		const name = field(item, 'title');
		const card = cards.get(item.match(GUID_ID)?.[1] ?? '');
		if (!name || !card || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: card.category,
			url: card.site || field(item, 'link') || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('vamosventures: no companies in the portfolio feed');
	}

	return companies;
}
