import type { ScrapedCompany } from './types';

const BASE_URL = 'https://hoxtonventures.com';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const API_URL = `${BASE_URL}/wp-json/wp/v2`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page is a wall of logo cards, each naming the
// company in its logo's alt text, linking its page here and, on one that has
// gone one way or another, carrying a badge ("Acquired", "IPO, Acquired",
// "Shut down", "Insolvent"). the site's own api serves the same companies
// with the sector, the country, the fund that holds them ("Hoxton III") and
// a status ("Active", "Acquired", "IPO", "Alumni", "Didn't work out"), and a
// write-up that links the company's site. the page decides who is listed —
// the api holds one company the page does not show. an acquisition, a
// listing or a sale is the way out, its badge kept with the Exited tag
// ("NYSE:BBLN" read as a listing); one that didn't work out ("Shut down",
// "Administration") keeps its badge without it, the fund's "Alumni"
// covering both.

const CARD = /<a href="https:\/\/hoxtonventures\.com\/portfolio\/([^/"]+)\/" class="loop-portfolio\b[^"]*">([\s\S]*?)<\/a>/g;
const ALT = /<img\b[^>]*\balt="([^"]*)"/;
const BADGE = /<span class="loop-portfolio__badge[^"]*">([\s\S]*?)<\/span>/;
const LINK = /href="(https?:\/\/[^"]+)"/g;
// a profile on someone else's site, or the fund's own pages, is not the company's site
const NOT_A_SITE =
	/(?:^|\.)(?:hoxtonventures\.com|linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com|crunchbase\.com|medium\.com|techcrunch\.com|sifted\.eu)$/i;
// the statuses and badges that are a way out
const OUT = /^(?:acquired|ipo|divested|acquihired|exited)\b/i;
// a badge naming the listing: "NYSE:BBLN"
const TICKER = /^[A-Z]{2,8}:\s?[A-Z.]{1,6}$/;
const STEALTH = /^stealth\b/i;

interface Term {
	id?: number;
	name?: string;
}

interface Entry {
	slug?: string;
	title?: { rendered?: string };
	content?: { rendered?: string };
	sector?: number[];
	country?: number[];
	funds?: number[];
	status?: number[];
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// a badge typed in capitals ("DISSOLVED") is written the way the others are
const said = (s: string) =>
	s && s === s.toUpperCase() && !TICKER.test(s) ? s[0] + s.slice(1).toLowerCase() : s;

const hostOf = (url: string) => {
	try {
		return new URL(url).hostname.toLowerCase();
	} catch {
		return '';
	}
};

async function fetchJson<T>(url: string): Promise<{ body: T; pages: number }> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`hoxton: ${url} answered ${resp.status}`);
	}
	return { body: (await resp.json()) as T, pages: Number(resp.headers.get('x-wp-totalpages') ?? 1) };
}

// the names of a taxonomy's terms, by id
async function terms(taxonomy: string): Promise<Map<number, string>> {
	const { body } = await fetchJson<Term[]>(`${API_URL}/${taxonomy}?per_page=100&_fields=id,name`);
	return new Map(body.flatMap((t) => (t.id && t.name ? [[t.id, clean(t.name)]] : [])));
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// the wall: who is listed, by slug, with the name and the badge it shows
	const cards = new Map<string, { name: string; badge: string }>();
	for (const [, slug, body] of html.matchAll(CARD)) {
		if (!cards.has(slug)) {
			cards.set(slug, { name: clean(body.match(ALT)?.[1] ?? ''), badge: clean(body.match(BADGE)?.[1] ?? '') });
		}
	}
	if (cards.size === 0) {
		throw new Error('hoxton: no companies on the portfolio wall');
	}

	const [sectors, countries, funds, statuses] = await Promise.all(
		['sector', 'country', 'funds', 'status'].map(terms)
	);
	if (statuses.size === 0) {
		throw new Error("hoxton: the api names no statuses — the site's filters moved");
	}

	// the api's entries, a hundred to a page
	const entries = new Map<string, Entry>();
	for (let page = 1, pages = 1; page <= pages && page <= 20; page++) {
		const answer = await fetchJson<Entry[]>(
			`${API_URL}/portfolio?per_page=100&page=${page}&_fields=slug,title,content,sector,country,funds,status`
		);
		pages = answer.pages;
		for (const entry of answer.body) if (entry.slug) entries.set(entry.slug, entry);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [slug, card] of cards) {
		const entry = entries.get(slug);
		const name = card.name || clean(entry?.title?.rendered ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const named = (ids: number[] | undefined, names: Map<number, string>) =>
			(ids ?? []).map((id) => tag(names.get(id) ?? '')).filter(Boolean);
		const status = named(entry?.status, statuses);
		const badge = card.badge ? tag(said(card.badge)) : '';
		const listing = TICKER.test(card.badge) ? `IPO (${card.badge})` : '';
		const out = status.some((s) => OUT.test(s)) || OUT.test(badge) || Boolean(listing);
		const site = [...(entry?.content?.rendered ?? '').matchAll(LINK)]
			.map(([, href]) => unescape(href).trim())
			.find((href) => {
				const host = hostOf(href);
				return host && !NOT_A_SITE.test(host);
			});

		companies.push({
			name,
			category: [
				...named(entry?.sector, sectors),
				...named(entry?.country, countries),
				...named(entry?.funds, funds),
				listing || badge,
				out ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: site || `${PAGE_URL}${slug}/`
		});
	}

	if (companies.length === 0) {
		throw new Error('hoxton: no companies on the portfolio wall');
	}
	// were the api to stop answering for the wall's companies, they would come in bare
	if (![...cards.keys()].some((slug) => entries.has(slug))) {
		throw new Error("hoxton: the api knows none of the wall's companies — the api moved");
	}

	return companies;
}
