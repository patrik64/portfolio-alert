import type { ScrapedCompany } from './types';

const BASE_URL = 'https://vsquared.vc';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const API_URL = `${BASE_URL}/wp-json/wp/v2`;
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page is a grid of cards, the whole portfolio in
// the page, a card a company linking its site, with its name and a line
// about it ("NEXT-GEN ROCKETS"). the cards decide who is listed. the page
// filters them by "generational growth theme" ("New Space", "Tech-Bio"),
// which the cards do not carry: the site's own api does, the companies
// being its "references", matched to the cards by name and read as a
// bonus — when the api will not answer, the companies lose only that tag.
// the theme is kept as a tag; the fund does not say which companies it is
// out of.

const CARD = /(?=<div class='portfolio__card__detailed'>)/;
const NAME = /<h4 class='portfolio__back--title'>([\s\S]*?)<\/h4>/;
const SITE = /<a target='_blank' href="([^"]*)" class='portfolio__back\b/;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Reference {
	title?: { rendered?: string };
	typification?: number[];
}

interface Term {
	id?: number;
	name?: string;
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#8211;|&ndash;/g, '–')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// every item of an api collection, a hundred at a time
async function all<T>(path: string): Promise<T[]> {
	const items: T[] = [];
	for (let page = 1, pages = 1; page <= pages && page <= MAX_PAGES; page++) {
		const resp = await fetch(`${API_URL}/${path}&per_page=100&page=${page}`, {
			headers: { 'User-Agent': UA, Accept: 'application/json' }
		});
		if (!resp.ok) throw new Error(`vsquared: the site's api answered ${resp.status}`);
		pages = Number(resp.headers.get('x-wp-totalpages')) || 1;
		items.push(...((await resp.json()) as T[]));
	}
	return items;
}

// each company's themes, by name; nothing when the api will not answer
async function themesOf(): Promise<Map<string, string[]>> {
	try {
		const [references, terms] = await Promise.all([
			all<Reference>('references?_fields=title,typification'),
			all<Term>('typification?_fields=id,name')
		]);
		const names = new Map(terms.map((t) => [t.id, tag(t.name ?? '')]));
		return new Map(
			references.map((r) => [
				clean(r.title?.rendered ?? '').toLowerCase(),
				(r.typification ?? []).map((id) => names.get(id) ?? '')
			])
		);
	} catch {
		// the themes are a bonus; the cards stand without them
		return new Map();
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [resp, themes] = await Promise.all([fetch(PAGE_URL, { headers: { 'User-Agent': UA } }), themesOf()]);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unescape(card.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: (themes.get(name.toLowerCase()) ?? [])
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('vsquared: no companies on the portfolio page — the markup moved');
	}

	return companies;
}
