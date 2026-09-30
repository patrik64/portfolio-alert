import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://backstagecapital.com/portfolio/';
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the portfolio page is a list served
// whole, an entry a company — its name linking its page on the fund's
// site, and a line about it — wearing its tags as classes, which the
// filters read. a company's page names its tags in words ("Tags: Media,
// Education") and holds its own site as the web icon among its links.
// those pages are fetched one at a time, and a page that will not load
// leaves its company linking to it, without tags. nothing marks an exit.

const ENTRY = /<div\b[^>]*\bclass="[^"]*\bcompany\b[^"]*"[^>]*>\s*<b>\s*<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
const SITE = /<a\b[^>]*\bclass="social-icon web"[^>]*\bhref="([^"]*)"|<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="social-icon web"/;
const TAGS = /<(?:b|strong)>\s*Tags:?\s*<\/(?:b|strong)>\s*([^<]*)|Tags:\s*([^<]*)</;
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

// the company's page on the fund's site, or nothing when it will not
// load; a refusal is waited out once
async function pageOf(url: string): Promise<string> {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const resp = await fetch(url, { headers: { 'User-Agent': UA } });
			if (resp.status === 429 && attempt === 0) {
				await resp.body?.cancel();
				await wait(REFUSED_MS);
				continue;
			}
			return resp.ok ? await resp.text() : '';
		} catch {
			return '';
		}
	}
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, href, text] of html.matchAll(ENTRY)) {
		const name = clean(text);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const page = unescape(href).trim();
		if (page) await wait(PACE_MS);
		const detail = /^https?:\/\//i.test(page) ? await pageOf(page) : '';
		const [, linked, alsoLinked] = detail.match(SITE) ?? [];
		const site = unescape(linked ?? alsoLinked ?? '').trim();
		const [, tags, alsoTags] = detail.match(TAGS) ?? [];
		companies.push({
			name,
			category: clean(tags ?? alsoTags ?? '')
				.split(',')
				.map((t) => tag(t))
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : page || PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('backstage: no companies on the portfolio page');
	}

	return companies;
}
