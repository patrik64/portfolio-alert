import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://arcane-ventures.net/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js: the home page's "Entities we're proud to accelerate/back" is a
// strip of logos scrolling past, drawn several times over so it never
// runs out, each logo named in its link's label and linking the company's
// page on x, which is kept as its link. nothing marks an exit.

const STRIP = /<ul\b[^>]*\bclass="[^"]*\bmarquee-track\b[^"]*"[^>]*>([\s\S]*?)<\/ul>/g;
const TILE = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
const HREF = /\bhref="([^"]*)"/;
const LABEL = /\baria-label="([^"]*)"/;
const ALT = /\balt="([^"]*)"/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, strip] of html.matchAll(STRIP)) {
		for (const [, attributes, body] of strip.matchAll(TILE)) {
			// "Mira Agent", or the logo's "Mira Agent logo"
			const name = clean(attributes.match(LABEL)?.[1] ?? '') || clean(body.match(ALT)?.[1] ?? '').replace(/\s+logo$/i, '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const link = unescape(attributes.match(HREF)?.[1] ?? '').trim();
			companies.push({ name, category: '', url: /^https?:\/\//i.test(link) ? link : PAGE_URL });
		}
	}
	if (companies.length === 0) {
		throw new Error('arcane: no logos in the strip');
	}

	return companies;
}
