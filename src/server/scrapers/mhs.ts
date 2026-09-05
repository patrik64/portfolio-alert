import type { ScrapedCompany } from './types';

const BASE_URL = 'http://www.mhscapital.com';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const POSTS_URL = `${BASE_URL}/wp-json/wp/v2/posts`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, and the site is http only — https does not answer at all — so
// that is how it is asked for.
//
// the wall is thirty-eight logos with no names on them: a company is a div
// whose classes are what the fund files it under and whose id is its slug, and
// the only words are the first line of its write-up, cut off mid-sentence.
// what the wall does carry is each company's post id, and the companies are
// ordinary wordpress posts, so one query to the api brings back all
// thirty-eight titles and write-ups together. the address is the link the
// write-up wraps around the logo.
//
// the classes are the fund's own words for its filters, which print them as
// they are stored — lower case — so they are kept that way rather than given
// capitals it does not use. two of them, all and featured, are about where a
// company appears on the page rather than what it is, and go. active is the
// state a company is in unless something has happened; exit is the fund's word
// for the other one and stays.

const CARD = /<div id="([a-z0-9-]+)" post_id="(\d+)"[^>]*class="company ([^"]*)"/g;
// what the fund's classes say about the page rather than the company
const DISPLAY = /^(?:all|featured|active)$/i;
const SITE = /href="(https?:\/\/[^"]+)"/g;
// the fund's own pages, which are not the company's
const NOT_A_COMPANY = /\/\/(?:[a-z0-9-]+\.)*mhscapital\.com\b/i;

interface Post {
	id?: number;
	title?: { rendered?: string };
	content?: { rendered?: string };
}

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);

	const listed = [...html.matchAll(CARD)].map(([, slug, id, classes]) => ({
		slug,
		id: Number(id),
		labels: classes
			.split(/\s+/)
			.map(clean)
			.filter((label) => label && !DISPLAY.test(label))
	}));
	if (listed.length === 0) {
		throw new Error('mhs: no companies on the portfolio wall');
	}

	const query = new URLSearchParams({
		per_page: '100',
		_fields: 'id,title,content',
		include: listed.map((company) => company.id).join(',')
	});
	const posts = new Map<number, Post>();
	for (const post of JSON.parse(await fetchText(`${POSTS_URL}?${query}`)) as Post[]) {
		if (post.id) posts.set(post.id, post);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const company of listed) {
		const post = posts.get(company.id);
		const name = clean(post?.title?.rendered ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const written = post?.content?.rendered ?? '';
		// one of the addresses is typed with a space on the end of it
		const site = [...written.matchAll(SITE)]
			.map((link) => clean(link[1]))
			.find((link) => !NOT_A_COMPANY.test(link));

		companies.push({
			name,
			category: company.labels.join(', '),
			url: site ?? `${BASE_URL}/portfolio/${company.slug}/`
		});
	}

	if (companies.length === 0) {
		throw new Error('mhs: the api named none of the companies on the wall');
	}

	return companies;
}
