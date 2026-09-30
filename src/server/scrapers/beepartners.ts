import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://beepartners.vc/portfolio';
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page is two grids under their headings,
// "Current Companies" and "Exited Companies", a tile a company — its
// picture, its name and a line about it — linking the company's page on
// the fund's site, where its own site is the "→ Website" link. those
// pages are fetched one at a time, and a page that will not load leaves
// its company linking to it.

const PART =
	/<h2\b[^>]*>([\s\S]*?)<\/h2>|<a\b[^>]*\bhref="(https:\/\/beepartners\.vc\/[^"]+)"[^>]*>\s*<img\b[^>]*\balt="([^"]*)"[^>]*>\s*<p\b[^>]*>([\s\S]*?)<\/p>/g;
// the arrow is written three ways, and a line break sometimes ends the link
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*>\s*(?:&rarr;|→|&#x2192;|&#8594;)?\s*Website\s*(?:<br\s*\/?>\s*)?<\/a>/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// the company's site, from its page on the fund's site, or nothing when
// the page will not load; a refusal is waited out once
async function siteOf(page: string): Promise<string> {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const resp = await fetch(page, { headers: { 'User-Agent': UA } });
			if (resp.status === 429 && attempt === 0) {
				await resp.body?.cancel();
				await wait(REFUSED_MS);
				continue;
			}
			if (!resp.ok) return '';
			const site = unescape((await resp.text()).match(SITE)?.[1] ?? '').trim();
			return /^https?:\/\//i.test(site) ? site : '';
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
	let exited = false;
	for (const [, heading, page, alt, text] of html.matchAll(PART)) {
		if (heading !== undefined) {
			exited = /\bexited\b/i.test(clean(heading));
			continue;
		}
		const name = clean(text) || clean(alt);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		await wait(PACE_MS);
		const site = await siteOf(unescape(page));
		companies.push({ name, category: exited ? 'Exited' : '', url: site || unescape(page) });
	}
	if (companies.length === 0) {
		throw new Error('beepartners: no companies on the portfolio page');
	}

	return companies;
}
