import type { ScrapedCompany } from './types';

const API_URL = 'https://lowercarbon.com/wp-json/wp/v2/company';
const PER_PAGE = 100;
const MAX_PAGES = 10;

// wordpress, with the portfolio as its own post type left open on the rest
// api — a cleaner read than the companies page, which repeats a few featured
// cards. each post's body carries a row of accent paragraphs: a badge for
// what the company does to carbon ("Slashing CO2", "Sucking up CO2", "Buying
// more time"), the founding year, the hq, and the company's own address as a
// link written out as its bare domain. the badge and the hq become the
// category; the year says when the company started rather than anything
// about it, so it is left out.

interface Post {
	title?: { rendered?: string };
	content?: { rendered?: string };
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so an hq written "Sunnyvale, CA" would read
// as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const ACCENT = /is-style-accent[^>]*>([\s\S]*?)<\/p>/g;
const SITE = /<a [^>]*href="(https?:\/\/[^"]+)"/;

export async function scrape(): Promise<ScrapedCompany[]> {
	const posts: Post[] = [];
	for (let page = 1; page <= MAX_PAGES; page++) {
		const resp = await fetch(`${API_URL}?per_page=${PER_PAGE}&page=${page}`);
		// wordpress answers the page after the last one with an error
		if (resp.status === 400 && posts.length > 0) break;
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${API_URL} page ${page}: ${resp.status}`);
		}
		const batch = (await resp.json()) as Post[];
		posts.push(...batch);
		if (batch.length < PER_PAGE) break;
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const post of posts) {
		const name = clean(post.title?.rendered ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const accents = [...(post.content?.rendered ?? '').matchAll(ACCENT)].map((m) => m[1]);
		const texts = accents.map((a) => clean(a));
		const badge = texts.find((t) => t !== '' && !/^Founded|^HQ:|\./.test(t)) ?? '';
		const hq = texts.find((t) => t.startsWith('HQ:'))?.slice(3) ?? '';
		// the accent line whose visible text is the bare domain links to the site
		const site =
			accents.find((a) => SITE.test(a) && /[a-z0-9-]+\.[a-z]{2,}/i.test(clean(a)))?.match(SITE)?.[1] ??
			'';

		companies.push({
			name,
			category: [tag(badge), tag(hq)].filter(Boolean).join(', '),
			url: site
		});
	}

	if (companies.length === 0) {
		throw new Error('lowercarbon: no companies over the rest api');
	}

	return companies;
}
