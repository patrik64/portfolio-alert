import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.npv.vc';
const PAGE_URL = `${BASE_URL}/portfolio/`;
// the wall opens each company in a lightbox, loading it out of this one
// archive page — so the archive is where the names are
const ARCHIVE_URL = `${BASE_URL}/project/`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress. the portfolio is a wall of logos with no names on it — a card is
// a picture, a badge for a company that has gone, and the slug it opens in a
// lightbox. what the lightbox loads is a block of the fund's project archive,
// and that archive holds all sixty-six with their names written out, so both
// pages are read and joined on the slug they share.
//
// what a company is filed under is in the archive too, as the classes
// wordpress puts on a post. the slugs those use are not what the fund calls
// them — it calls life-sciences "R&D Tools" — so the words come from the
// filters on the wall, where the fund writes them out, and a class the filters
// do not name is left off rather than tidied into a word of our own. that
// takes the stage with it: the fund files a company under one, but offers no
// filter for it and prints it nowhere, so a reader cannot see it at all.
//
// a company keeps the fund's own page for it: the archive prints no address
// for any of them, and neither does a company's own page there.

const CARD = /<a[^>]*class="border-wrapp lightbox"[\s\S]*?<\/a>/g;
const SLUG = /data-filter="#?([^"]*)"/;
const STATUS = /class="status ([^"]*)"[^>]*>\s*<span>([\s\S]*?)<\/span>/;
// the fund writes out what each of its filter classes means
const OPTION = /<option[^>]*value="([^",]*)"[^>]*>([^<]*)<\/option>/g;
const POST = /<div class="post-\d+ project([^"]*)" id="post-\d+">([\s\S]*?)(?=<div class="post-\d+ project|<\/div>\s*<\/div>)/g;
const TITLE = /<h2><a href="[^"]*\/project\/([^"/]+)\/?"[^>]*>([\s\S]*?)<\/a>/;
const FILED = /\bproject_(?:cat|sect)-([a-z0-9-]+)/g;
// what a company is while it is neither acquired nor public
const HELD = /^(active|none)$/i;

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => un(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a filter written with a comma in it would
// read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// the badge is written lowercase and drawn in capitals, so it is given the one
// capital it reads with
const badge = (s: string) => clean(s).replace(/^[a-z]/, (c) => c.toUpperCase());

async function fetchPage(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [wall, archive] = await Promise.all([fetchPage(PAGE_URL), fetchPage(ARCHIVE_URL)]);

	// what the fund calls each class it files a company under
	const named = new Map<string, string>();
	for (const [, slug, label] of wall.matchAll(OPTION)) {
		const written = tag(label);
		// the openers name no class of their own
		if (slug && written && !/^all /i.test(written)) named.set(slug, written);
	}

	// how a company has done, off the badge the wall draws over its logo
	const status = new Map<string, string>();
	for (const card of wall.match(CARD) ?? []) {
		const slug = clean(card.match(SLUG)?.[1] ?? '');
		const found = card.match(STATUS);
		if (!slug || !found) continue;
		status.set(slug, HELD.test(clean(found[1])) ? '' : badge(found[2]));
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, classes, post] of archive.matchAll(POST)) {
		const found = post.match(TITLE);
		if (!found) continue;
		const slug = clean(found[1]);
		const name = clean(found[2]);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: [
				...[...classes.matchAll(FILED)].map((match) => named.get(match[1]) ?? ''),
				status.get(slug) ?? ''
			]
				.filter(Boolean)
				.join(', '),
			url: `${BASE_URL}/project/${slug}/`
		});
	}

	if (companies.length === 0) {
		throw new Error('northpond: no companies in the portfolio archive');
	}

	return companies;
}
