import type { ScrapedCompany } from './types';

const BASE_URL = 'https://redbud.vc';
const SITEMAP_URL = `${BASE_URL}/sitemap.xml`;
const COMPANY_PATH = '/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 10;

// framer, and it draws the portfolio in the browser: the page that lists it
// arrives with the sector filters, forty-six logos and not one link or name.
// so the companies are found in the sitemap, which is where framer writes the
// collection out, and each one's page is fetched for what it says.
//
// a page gives the name in its title, a link marked "web link", and the town
// beside it. the slug is not the name — the fund renames a company in the
// collection without moving it, so /portfolio/walt is Amby now — which is why
// the title is read rather than the address of the page it came from.
//
// three companies are called "Stealth". that is not a name to file three
// different companies under, and they would collapse into one, so they are
// left out until the fund says who they are.

const LOC = /<loc>([^<]*)<\/loc>/g;
const TITLE = /<meta property="og:title" content="([^"]*)"/;
const WEB_LINK = /<a class="[^"]*" data-framer-name="Web Link" href="(https?:\/\/[^"]+)"/;
const PARAGRAPH = /<p class="framer-text[^"]*"[^>]*>([\s\S]*?)<\/p>/g;
// what the fund suffixes every page title with
const SUFFIX = /\s*\|\s*Redbud VC\s*$/i;
// the fund's placeholder for a company it is not naming yet
const UNNAMED = /^stealth$/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a town written "Austin, TX" would read as
// two tags rather than one place
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const sitemap = await fetchText(SITEMAP_URL);
	const urls: string[] = [];
	for (const m of sitemap.matchAll(LOC)) {
		const url = clean(m[1]);
		if (url.includes(COMPANY_PATH) && !urls.includes(url)) urls.push(url);
	}

	if (urls.length === 0) {
		throw new Error('redbud: the sitemap lists no portfolio companies');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (let i = 0; i < urls.length; i += BATCH_SIZE) {
		const batch = urls.slice(i, i + BATCH_SIZE);
		const pages = await Promise.all(batch.map((u) => fetchText(u).catch(() => '')));
		for (const page of pages) {
			const flat = page.replace(/\s+/g, ' ');
			const name = clean(flat.match(TITLE)?.[1]?.replace(SUFFIX, '') ?? '');
			if (!name || UNNAMED.test(name) || seen.has(name)) continue;
			seen.add(name);

			// the town is the last line before the link, so it is only read
			// where there is a link to read it against
			const link = flat.match(WEB_LINK);
			const said = link ? [...flat.slice(0, link.index).matchAll(PARAGRAPH)] : [];
			companies.push({
				name,
				category: tag(said[said.length - 1]?.[1] ?? ''),
				url: link?.[1] ?? ''
			});
		}
	}

	return companies;
}
