import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.portugalventures.pt';
const PAGE_URL = `${BASE_URL}/en/portfolio/`;
// the site's feed of its portfolio entries, ten a page, and its sitemap of them
const FEED_URL = `${BASE_URL}/feed/?post_type=portfolio&lang=en`;
const SITEMAP_URL = `${BASE_URL}/portfolio-sitemap.xml`;
const MAX_PAGES = 100;
// the feed's pages are asked for one at a time, a pause between them: the
// host answers a client's requests one at a time whatever it is sent, so
// asking for several at once gains nothing, and makes a page past the end
// twenty-five seconds coming instead of one
const PACE_MS = 500;
// the thirty requests ran past the night's four minutes on 2026-10-20, a run
// that takes half a minute at most on other nights: an answer this long
// coming is given up on and asked for once more, so that a single hung
// request cannot run the night's budget out
const ANSWER_MS = 30_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page is a grid of logos, the whole of it in the
// page, a logo a company classed for the page's filter by its sector and
// field ("Manufacturing & Technology", "SaaS") or as an exit ("Exits",
// "Reference Exits"), linking its page here — or, for many an exit, the
// company's own site. the logos have no alt text, and a company's page is
// slow to serve, so the names are read from the site's feed of its
// portfolio entries, a title each, matched to a logo by the entry's address
// where the logo links its page, or else by the picture the site's sitemap
// files under that address. a logo matched to no entry is left out. the
// sector and field are kept as tags, an exit with the Exited tag. every page
// of the feed must load.

const TILE =
	/<div data-categories="[^"]*" class="col-xs-6[^"]*\bitem ([^"]*?)single-portfolio[^"]*">\s*<a href="([^"]*)"[^>]*>\s*<img\b[^>]*\bdata-src="([^"]*)"/g;
const LABEL = /<a href="javascript:;" class="([^"]*)">([^<]*)<\/a>/g;
const ITEM = /<item>\s*<title>([\s\S]*?)<\/title>\s*<link>([\s\S]*?)<\/link>/g;
const ENTRY = /<url>([\s\S]*?)<\/url>/g;
const LOC = /<loc><!\[CDATA\[([^\]]*)\]\]><\/loc>/;
const IMAGE = /<image:loc>\s*<!\[CDATA\[([^\]]*)\]\]>/g;
const EXITS = 'exits-en';
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Answer {
	status: number;
	body: string;
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) =>
	unescape(s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// an address's last part: ".../portfolio/ablute/" -> "ablute"
const slugOf = (href: string) => href.replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').pop() ?? '';

// a picture's file, without the sizes the site cuts it to: "image001-1024x724-1.jpg" -> "image001-1.jpg"
const pictureOf = (src: string) => (src.split('/').pop() ?? '').replace(/-\d+x\d+(?=[.-])/g, '').toLowerCase();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url: string): Promise<Answer> {
	for (let attempt = 0; ; attempt++) {
		try {
			const resp = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(ANSWER_MS) });
			return { status: resp.status, body: await resp.text() };
		} catch (e) {
			if (!(e instanceof Error && e.name === 'TimeoutError')) throw e;
			if (attempt > 0) {
				throw new Error(`portugalventures: ${url} did not answer in ${ANSWER_MS / 1000} s, asked twice`);
			}
		}
	}
}

async function fetchText(url: string): Promise<string> {
	const answer = await get(url);
	if (answer.status !== 200) {
		throw new Error(`Failed to fetch ${url}: ${answer.status}`);
	}
	return answer.body;
}

// a page of the feed's items, or nothing past its last page
async function feedPage(page: number): Promise<RegExpMatchArray[] | undefined> {
	const url = `${FEED_URL}&paged=${page}`;
	const answer = await get(url);
	// the feed answers a page past its last with "not found"
	if (answer.status === 404 && page > 1) return undefined;
	if (answer.status !== 200) {
		throw new Error(`Failed to fetch ${url}: ${answer.status}`);
	}
	const items = [...answer.body.matchAll(ITEM)];
	return items.length > 0 ? items : undefined;
}

// every entry's title by its address's last part, the feed read to its end:
// a page shorter than the first is its last, or else the one past it is empty
async function titles(): Promise<Map<string, string>> {
	const bySlug = new Map<string, string>();
	let pageSize = 0;
	for (let page = 1; page <= MAX_PAGES; page++) {
		if (page > 1) await wait(PACE_MS);
		const items = await feedPage(page);
		if (!items) return bySlug;
		for (const [, title, link] of items) bySlug.set(slugOf(clean(link)), clean(title));
		if (page === 1) pageSize = items.length;
		else if (items.length < pageSize) return bySlug;
	}
	throw new Error(`portugalventures: the feed ran past ${MAX_PAGES} pages`);
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);
	const tiles = [...html.matchAll(TILE)];
	if (tiles.length === 0) {
		throw new Error('portugalventures: no logos in the portfolio grid — the markup moved');
	}
	// the filter's labels, by the class each shows; a field's "All" names nothing
	const labels = new Map<string, string>();
	for (const [, cls, label] of html.matchAll(LABEL)) {
		if (!labels.has(cls) && !UNSAID.test(clean(label))) labels.set(cls, tag(label));
	}
	const bySlug = await titles();
	// the entries' addresses, by the pictures the sitemap files under them
	const byPicture = new Map<string, Set<string>>();
	for (const [, entry] of (await fetchText(SITEMAP_URL)).matchAll(ENTRY)) {
		const slug = slugOf(entry.match(LOC)?.[1] ?? '');
		for (const [, src] of entry.matchAll(IMAGE)) {
			const picture = pictureOf(src);
			byPicture.set(picture, (byPicture.get(picture) ?? new Set()).add(slug));
		}
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, classes, link, src] of tiles) {
		const href = unescape(link).trim();
		const own = /^https?:\/\/(?:www\.)?portugalventures\.pt\//i.test(href);
		// the logo's own page names it; failing that, the one entry filed under its picture
		let name = own ? (bySlug.get(slugOf(href)) ?? '') : '';
		if (!name) {
			const named = new Set(
				[...(byPicture.get(pictureOf(unescape(src))) ?? [])].map((slug) => bySlug.get(slug) ?? '').filter(Boolean)
			);
			if (named.size === 1) [name] = named;
		}
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const kinds = classes.trim().split(/\s+/);
		companies.push({
			name,
			category: [
				...kinds.filter((cls) => cls !== EXITS).map((cls) => labels.get(cls) ?? ''),
				kinds.includes(EXITS) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			// a logo linking the grid itself links no page of its own
			url: /^https?:\/\//i.test(href) && slugOf(href) !== 'portefolio' ? href : PAGE_URL
		});
	}

	// a feed or sitemap that stopped naming the logos would leave the grid all but empty
	if (companies.length < tiles.length * 0.8) {
		throw new Error(
			`portugalventures: only ${companies.length} of ${tiles.length} logos were named — the feed or sitemap moved`
		);
	}

	return companies;
}
