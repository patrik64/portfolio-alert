import type { ScrapedCompany } from './types';

// the fund's own spelling of the address
const PAGE_URL = 'https://www.dreamers.vc/portolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: every company is a card with the name, the category the fund
// files it under ("Finance-Tech"), a line about it and a "learn more" link
// to its site. one the fund is out of has its line opened with "[Exited]",
// or appears a second time filed under "Exited" in place of a category;
// the copies are folded into one card with the tag. the filters run in the
// browser, so the page holds every card.

const ITEM = /(?=<div[^>]*class="mix portfolio-page w-dyn-item)/;
const NAME = /class="heading-3"[^>]*>([\s\S]*?)<\/h\d>/;
const CATEGORY = /class="category-link filter-category"[^>]*>([\s\S]*?)<\/a>/;
const BLURB = /class="blurb-text"[^>]*>([\s\S]*?)<\/div>/;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*class="link-black"/;
const STEALTH = /^stealth\b/i;

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

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const cards = new Map<string, { name: string; categories: string[]; exited: boolean; url: string }>();
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name)) continue;
		const category = tag(item.match(CATEGORY)?.[1] ?? '');
		const blurb = clean(item.match(BLURB)?.[1] ?? '');
		const exited = /^exited$/i.test(category) || /^\[?exited\]?/i.test(blurb);
		const url = unescape(item.match(LINK)?.[1] ?? '').trim();
		const card = cards.get(name.toLowerCase()) ?? { name, categories: [], exited: false, url: '' };
		if (!/^(exited|other)$/i.test(category) && category) card.categories.push(category);
		card.exited ||= exited;
		card.url ||= url;
		cards.set(name.toLowerCase(), card);
	}

	const companies: ScrapedCompany[] = [...cards.values()].map(({ name, categories, exited, url }) => ({
		name,
		category: [...categories, exited ? 'Exited' : ''].filter((t, i, all) => t && all.indexOf(t) === i).join(', '),
		url: url || PAGE_URL
	}));

	if (companies.length === 0) {
		throw new Error('dreamers: no companies on the portfolio page');
	}

	return companies;
}
