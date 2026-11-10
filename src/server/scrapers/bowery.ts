import type { ScrapedCompany } from './types';

// the portfolio moved onto the front page in the rebuild of 2026-11-09, and
// /portfolio now redirects there
const PAGE_URL = 'https://bowerycap.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// astro, drawn whole on the server: the front page is a list of the
// portfolio, a row a company — its logo, named in the alt text ("ActionIQ"),
// a line about it, and beneath, an "Exited" tag for a company the fund is
// out of, where it is ("NYC", "Bay Area") and a link to its site. how an
// exit went is only in the prose. (the page's structured data lists the same
// companies, without the tag.)

const ROW = /<li\b[^>]*\bclass="row"[^>]*>([\s\S]*?)<\/li>/g;
const NAME = /<img\b[^>]*\balt="([^"]*)"/;
const META = /<div\b[^>]*\bclass="meta"[^>]*>([\s\S]*?)<\/div>/;
// the tag and the place are the meta line's spans, the tag marked as one
const TAG = /<span\b[^>]*\bclass="tag"[^>]*>([\s\S]*?)<\/span>/g;
const PLACE = /<span(?![^>]*\bclass=)[^>]*>([\s\S]*?)<\/span>/;
const EXITED = /^exit(?:ed)?$/i;
const SITE = /<a\b[^>]*?\bhref="([^"]*)"[^>]*\bclass="visit"/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, row] of html.matchAll(ROW)) {
		const name = clean(row.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unescape(row.match(SITE)?.[1] ?? '').trim();
		const meta = row.match(META)?.[1] ?? '';
		const exited = [...meta.matchAll(TAG)].some(([, t]) => EXITED.test(clean(t)));
		companies.push({
			name,
			category: [tag(meta.match(PLACE)?.[1] ?? ''), exited ? 'Exited' : ''].filter(Boolean).join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('bowery: no companies on the portfolio page');
	}

	return companies;
}
