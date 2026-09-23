import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.homebrew.co/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the portfolio on the front page in three lists: a few featured
// names, then every company still held — a name, a line about what it does,
// and a link to its site (or to "#") — and, under an "Exits" heading, the
// companies the fund is out of, each with where it went: a buyer ("Spotify")
// or a listing ("NASDAQ: CHYM"). a featured company can also have exited, so
// the lists are merged by name: the address from the one that has it, the
// exit from the exits.

const EXITS = /<h2[^>]*>\s*Exits\s*<\/h2>/i;
const FEATURED = /class="featured-collection-item[^"]*"[^>]*>\s*<a href="([^"]*)"[^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>/g;
const HELD = /<a href="([^"]*)"[^>]*class="collection-link[^"]*"[^>]*>\s*<h4 class="portfolio-name">([\s\S]*?)<\/h4>/g;
const GONE = /<h4 class="portfolio-name">([\s\S]*?)<\/h4>\s*<p class="description">([\s\S]*?)<\/p>/g;
// a listing is written "NASDAQ: CHYM", a token "$NEAR"
const LISTING = /^\$|:/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const address = (href: string) => (/^https?:\/\//i.test(href) ? unescape(href) : '');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const split = html.search(EXITS);
	const held = split < 0 ? html : html.slice(0, split);
	const gone = split < 0 ? '' : html.slice(split);

	const companies = new Map<string, ScrapedCompany>();
	const add = (name: string, url: string, category = '') => {
		if (!name) return;
		const known = companies.get(name.toLowerCase());
		if (known) {
			known.url ||= url;
			known.category ||= category;
		} else {
			companies.set(name.toLowerCase(), { name, category, url });
		}
	};

	for (const [, href, name] of held.matchAll(FEATURED)) add(clean(name), address(href));
	for (const [, href, name] of held.matchAll(HELD)) add(clean(name), address(href));
	for (const [, name, where] of gone.matchAll(GONE)) {
		const outcome = clean(where);
		add(
			clean(name),
			'',
			[outcome && (LISTING.test(outcome) ? outcome : `Acquired by ${outcome}`), 'Exited']
				.filter(Boolean)
				.join(', ')
		);
	}

	if (companies.size === 0) {
		throw new Error('homebrew: no companies in the portfolio lists');
	}

	return [...companies.values()];
}
