import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://rockhealthcapital.com/portfolio/';
// the site's nginx answers 403 to chrome user-agent strings and lets safari
// through, as santé's and stray dog's do
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const BATCH_SIZE = 10;

// wordpress with a filterable grid. every company is one article carrying its
// name and, in its class list, the terms the fund files it under — a sector or
// two, which coast it is on, and "exited" where it has left.
//
// the grid gives no addresses. each article does carry the url of the popup the
// grid opens on click, and that popup holds the company's own address under a
// dp_field_link. those are fetched, twenty-seven kilobytes at a time.
//
// the terms appear only as slugs — the page never writes their labels, the
// portfolio's wordpress exposes no rest api, and the popups do not name them
// either — so the slugs are read back as words. one of them, "wearableshardware",
// lost a separator before it ever reached the page and stays as it is.

const ARTICLE = '<article id="post-';
const CLASSES = /^\d+" class="([^"]*)"/;
const NAME = /<h2 class="entry-title">([^<]*)<\/h2>/;
const POPUP = /data-ajax-url="([^"]+)"/;
const TERM = /company-category-([a-z0-9-]+)/g;
const WEBSITE = /<a class="dp_field_link" href="(https?:\/\/[^"]+)"/;
const EXITED = 'exited';

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

const asWords = (slug: string) =>
	slug
		.split('-')
		.filter(Boolean)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);

	const listed: { name: string; terms: string[]; popup: string }[] = [];
	const seen = new Set<string>();
	for (const article of html.split(ARTICLE).slice(1)) {
		const name = clean(article.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name)) continue;
		seen.add(name);
		listed.push({
			name,
			terms: [...(article.match(CLASSES)?.[1] ?? '').matchAll(TERM)].map((m) => m[1]),
			popup: clean(article.match(POPUP)?.[1] ?? '')
		});
	}

	if (listed.length === 0) {
		throw new Error('rockhealth: no companies on the portfolio page');
	}

	const companies: ScrapedCompany[] = listed.map((c) => ({
		name: c.name,
		category: [
			...c.terms.filter((t) => t !== EXITED).map(asWords),
			c.terms.includes(EXITED) ? 'Exited' : ''
		]
			.filter(Boolean)
			.join(', '),
		url: ''
	}));

	for (let i = 0; i < listed.length; i += BATCH_SIZE) {
		const batch = listed.slice(i, i + BATCH_SIZE);
		const pages = await Promise.all(
			batch.map((c) => (c.popup ? fetchText(c.popup).catch(() => '') : Promise.resolve('')))
		);
		pages.forEach((page, j) => {
			companies[i + j].url = page.match(WEBSITE)?.[1] ?? '';
		});
	}

	return companies;
}
