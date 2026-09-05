import type { ScrapedCompany } from './types';

const BASE_URL = 'http://www.sigmaprime.com';
const PAGES = [
	{ path: '/portfolio', exited: false },
	{ path: '/portfolio/past', exited: true }
];
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 10;

// drupal, and the portfolio is two tabs: the companies the fund still holds and
// the ones it has exited, under /portfolio/past.
//
// the grid gives the name and a link to the fund's own write-up. the company's
// address is on that write-up, so each one is fetched — it is written as a
// paragraph whose link text is the bare domain, "www.acquia.com".
//
// the last such link is the one taken, because the fund lists a company's blog
// and its jobs page above its address, and those read as bare domains too.

const ITEM = /<a href="(\/portfolio\/[^"]+)"><div class="item-description">\s*<h5>([^<]*)<\/h5>/g;
const LINK = /<a href="(https?:\/\/[^"]+)"[^>]*>([^<]*)<\/a>/g;
const BARE = /^(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\/?$/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

function websiteOf(html: string): string {
	let found = '';
	for (const m of html.matchAll(LINK)) {
		if (m[1].includes('sigmaprime')) continue;
		if (BARE.test(clean(m[2]))) found = m[1];
	}
	return found;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const listed: { name: string; path: string; exited: boolean }[] = [];
	const seen = new Set<string>();
	for (const page of PAGES) {
		const html = await fetchText(`${BASE_URL}${page.path}`);
		for (const m of html.matchAll(ITEM)) {
			const name = clean(m[2]);
			if (!name || seen.has(name)) continue;
			seen.add(name);
			listed.push({ name, path: m[1], exited: page.exited });
		}
	}

	if (listed.length === 0) {
		throw new Error('sigmaprime: no companies on the portfolio page');
	}

	const companies: ScrapedCompany[] = listed.map((c) => ({
		name: c.name,
		category: c.exited ? 'Exited' : '',
		url: ''
	}));

	for (let i = 0; i < listed.length; i += BATCH_SIZE) {
		const batch = listed.slice(i, i + BATCH_SIZE);
		const pages = await Promise.all(
			batch.map((c) => fetchText(`${BASE_URL}${c.path}`).catch(() => ''))
		);
		pages.forEach((page, j) => {
			companies[i + j].url = websiteOf(page);
		});
	}

	return companies;
}
