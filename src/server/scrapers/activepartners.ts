import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://active.partners/companies/';
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the companies page is a grid of cards,
// each a picture, a line about the company, a logo with no alt text and a
// link to the company's profile on the fund's site, carrying the filters
// it answers to ("early-stage", "growth", "exited"), spelled out on the
// filter's links and kept as tags, "Exited" for the ones the fund is out
// of. the company is named only on its profile, which also links its site
// under a globe and says the year it was founded, kept as a tag; the
// profiles are fetched one at a time, and one that will not load fails the
// run, since the name would be lost with it.

const FILTER = /<a\b[^>]*\bclass="cat-link[^"]*"[^>]*\bdata-cat="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
const CARD = /<div\b[^>]*\bclass="card-2\b[^"]*"[^>]*\bdata-cat="([^"]*)"[^>]*>[\s\S]*?<a\b[^>]*\bclass="cover-link"[^>]*\bhref="([^"]*)"/g;
// the name heads the profile; failing that, the page's title has it
const NAME = /<h1\b[^>]*>([\s\S]*?)<\/h1>/;
const TITLE = /<title[^>]*>([\s\S]*?)\s+[-–|]\s+Active Partners\s*<\/title>/i;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*>\s*<i\b[^>]*\bfa-globe\b/;
const FOUNDED = /<h3\b[^>]*>\s*Founded\s*<\/h3>\s*<p\b[^>]*>([\s\S]*?)<\/p>/i;
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

// a company's profile; a refusal is waited out once, and a profile that
// still will not load fails the run
async function profile(url: string): Promise<string> {
	for (let attempt = 0; ; attempt++) {
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (resp.status === 429 && attempt === 0) {
			await resp.body?.cancel();
			await wait(REFUSED_MS);
			continue;
		}
		if (!resp.ok) {
			throw new Error(`activepartners: ${url} answered ${resp.status}`);
		}
		return resp.text();
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// "early-stage" -> "Early-stage", from the filter's links
	const labels = new Map<string, string>();
	for (const [, slug, label] of html.matchAll(FILTER)) {
		if (slug && slug !== 'all') labels.set(slug, tag(label));
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	const pages = new Set<string>();
	for (const [, cats, href] of html.matchAll(CARD)) {
		const page = unescape(href).trim();
		if (!/^https?:\/\//i.test(page) || pages.has(page)) continue;
		pages.add(page);
		await wait(PACE_MS);
		const detail = await profile(page);
		const name = clean(detail.match(NAME)?.[1] ?? '') || clean(detail.match(TITLE)?.[1] ?? '');
		if (!name) {
			throw new Error(`activepartners: ${page} names no company`);
		}
		if (STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const slugs = cats.split(/\s+/).filter(Boolean);
		const out = slugs.includes('exited');
		const founded = clean(detail.match(FOUNDED)?.[1] ?? '').match(/\b(?:19|20)\d{2}\b/)?.[0];
		const site = unescape(detail.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				...slugs.filter((slug) => slug !== 'exited').map((slug) => labels.get(slug) ?? tag(slug)),
				founded ? `Founded ${founded}` : '',
				out ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : page
		});
	}
	if (companies.length === 0) {
		throw new Error('activepartners: no company cards on the companies page');
	}

	return companies;
}
