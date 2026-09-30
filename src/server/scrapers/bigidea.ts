import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://bigideaventures.com/portfolio/';
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// the site's server answers 403 to chrome user-agent strings and lets
// through a request that says plainly who is asking: so this one does
const UA = 'portfolio-alert/1.0 (+https://portfolio-alert.vercel.app)';

// wordpress on divi: the portfolio page is a wall of logos, each linking
// the company's page on the fund's site, and the names are only there —
// in the page's title ("UpTerra - bigideaventures") — with the company's
// site among the icon links under its piece and, as tags, the fund it sits
// in ("Generation Food Rural Partners Fund"), its region and country, its
// category ("Plant-based") and its technology ("Materials Science"). the
// pages are fetched one at a time; one that will not load fails the run,
// as the name would go with it. "Others" as a category says nothing.
// nothing marks an exit.

const TILE = /<a\s+href=(?:"([^"]*)"|'([^']*)'|([^\s>]+))\s*>\s*<span class="portfolio-poster">/g;
const TITLE = /<title[^>]*>([\s\S]*?)<\/title>/;
const SITE_NAME = /\s+[-–—|]\s+bigideaventures\s*$/i;
const ICONS = /<p\b[^>]*\bclass="teamsocial[^"]*"[^>]*>([\s\S]*?)<\/p>/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/g;
const SOCIAL = /linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com|crunchbase\.com/i;
const TAGS = /<div class="tags">\s*<ul>([\s\S]*?)<\/ul>/;
const ITEM = /<li\b[^>]*>([\s\S]*?)<\/li>/g;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// a page of the fund's site; a refusal is waited out once, and a page that
// still will not load fails the run
async function page(url: string): Promise<string> {
	for (let attempt = 0; ; attempt++) {
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (resp.status === 429 && attempt === 0) {
			await resp.body?.cancel();
			await wait(REFUSED_MS);
			continue;
		}
		if (!resp.ok) {
			throw new Error(`bigidea: ${url} answered ${resp.status}`);
		}
		return resp.text();
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await page(PAGE_URL);
	const links = [...html.matchAll(TILE)]
		.map(([, a, b, c]) => unescape(a ?? b ?? c ?? '').trim())
		.filter((link) => /^https?:\/\//i.test(link));
	if (links.length === 0) {
		throw new Error('bigidea: no companies on the portfolio page');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [i, link] of links.entries()) {
		if (i > 0) await wait(PACE_MS);
		const detail = await page(link);
		const name = clean(detail.match(TITLE)?.[1] ?? '').replace(SITE_NAME, '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = [...(detail.match(ICONS)?.[1] ?? '').matchAll(LINK)]
			.map(([, href]) => unescape(href).trim())
			.find((href) => /^https?:\/\//i.test(href) && !SOCIAL.test(href));
		companies.push({
			name,
			category: [...(detail.match(TAGS)?.[1] ?? '').matchAll(ITEM)]
				.map(([, item]) => tag(item))
				.filter((t, k, all) => t && !/^others?$/i.test(t) && all.indexOf(t) === k)
				.join(', '),
			url: site ?? link
		});
	}
	if (companies.length === 0) {
		throw new Error('bigidea: no companies named on their pages');
	}

	return companies;
}
