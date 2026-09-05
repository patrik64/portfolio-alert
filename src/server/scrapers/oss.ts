import type { ScrapedCompany } from './types';

const BASE_URL = 'https://oss.capital';
const FEED_URL = `${BASE_URL}/wp-json/wp/v2/jetpack-portfolio?per_page=100&_fields=title,link,content`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress. the portfolio page is a wall of logos and nothing else: the only
// name a card carries is its image's alt text, and the only address it points
// at is the fund's own page for the company. the post type behind that wall
// comes back whole from the rest feed, with the name the fund publishes and
// the write-up from the company's page, and the write-up names the company's
// own site under a "Profiles" heading. so the feed is read rather than the
// wall, and a company points at itself. where a write-up names no site — none
// today — the company keeps the fund's page, which is where the wall points.
//
// the fund files a company under nothing at all: both of the post type's
// taxonomies are empty on every entry, and neither the wall nor a company's
// page prints a sector, a stage or a place. a page opens on a sentence about
// the product rather than a name to file it under, so every company here is
// left with no category.

// an anchor and the text it is written on, so the one labelled Website can be
// picked out of the write-up
const LINK = /<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

interface Post {
	title?: { rendered?: string };
	link?: string;
	content?: { rendered?: string };
}

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

const clean = (s: string) => un(s).replace(/\s+/g, ' ').trim();

// the label is written as a link's text, so any markup inside it is dropped
// before it is read
const label = (s: string) => clean(s.replace(/<[^>]+>/g, ''));

const site = (post: Post) => {
	const written = post.content?.rendered ?? '';
	for (const [, href, text] of written.matchAll(LINK)) {
		if (/^website$/i.test(label(text))) return clean(href);
	}
	return clean(post.link ?? '');
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(FEED_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${FEED_URL}: ${resp.status}`);
	}

	let posts: Post[];
	try {
		posts = (await resp.json()) as Post[];
	} catch {
		throw new Error('oss: the portfolio came back in a shape that could not be read');
	}
	if (!Array.isArray(posts)) {
		throw new Error('oss: the portfolio came back in a shape that could not be read');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const post of posts) {
		const name = clean(post.title?.rendered ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({ name, category: '', url: site(post) });
	}

	if (companies.length === 0) {
		throw new Error('oss: no companies in the portfolio feed');
	}

	return companies;
}
