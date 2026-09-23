import type { ScrapedCompany } from './types';

const BASE_URL = 'https://fpvventures.com';
const PAGE_URL = `${BASE_URL}/all-companies/`;
const TITLES_URL = `${BASE_URL}/wp-json/wp/v2/case-studies?per_page=100&_fields=id,title`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress under elementor: every company on the all-companies page is a
// post of the "case-studies" type, drawn as its logo — with no alt text — a
// line about it and a button linking its site, whose label is the address.
// the name is only in the post's title, which the rest api gives; the posts
// are matched to the page's cards by id, so the page still decides who is
// listed. a title written all in lower case ("databricks") is capitalized.

const CARD = /<article\b[^>]*\bid="post-(\d+)"[^>]*>([\s\S]*?)<\/article>/g;
const SITE = /<a\b[^>]*class="[^"]*\belementor-button-link\b[^"]*"[^>]*\bhref="(https?:\/\/[^"]+)"/;
const STEALTH = /^stealth\b/i;

interface Post {
	id: number;
	title?: { rendered?: string };
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [html, posts] = await Promise.all([fetchText(PAGE_URL), fetchText(TITLES_URL)]);
	const titles = new Map(
		(JSON.parse(posts) as Post[]).map((post) => [String(post.id), clean(post.title?.rendered ?? '')])
	);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	const cards = [...html.matchAll(CARD)];
	for (const [, id, card] of cards) {
		const title = titles.get(id) ?? '';
		const name = title === title.toLowerCase() && title ? title[0].toUpperCase() + title.slice(1) : title;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url: unescape(card.match(SITE)?.[1] ?? '') });
	}

	if (companies.length === 0) {
		throw new Error('fpv: no companies on the all-companies page');
	}
	// a card the rest api has no title for goes unnamed; many of them is a
	// sign the two have parted ways
	if (companies.length < cards.length * 0.9) {
		throw new Error(`fpv: named ${companies.length} of the ${cards.length} companies on the page`);
	}

	return companies;
}
