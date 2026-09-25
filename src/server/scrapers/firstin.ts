import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://wearefirstin.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace, the portfolio a section of the home page: a code block the
// fund edits by hand, one numbered slot a company — a comment naming it in
// capitals ("PHYLUM (VERACODE)", the buyer in brackets for one sold), then a
// tile linking the company's site, or the buyer's, its name in the tile's
// aria-label with "-Acquired" tacked on for some of the sold ones, and an
// "Acquired" badge. the name comes from the label, the buyer from the
// comment, and a badge is an exit.

const GRID = /<div class="portfolio-grid">([\s\S]*?)<\/div>\s*<\/div>/;
const SLOT = /<!--\s*([^>]*?)\s*—\s*START\s*-->\s*<a\b([^>]*)>([\s\S]*?)<\/a>/g;
const LABEL = /\baria-label="([^"]*)"/;
const HREF = /\bhref="([^"]*)"/;
const BUYER = /\(([^)]+)\)\s*$/;
const ACQUIRED = /\bis-acquired\b|<span[^>]*>\s*Acquired\s*<\/span>/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// "FORCEPOINT" -> "Forcepoint", "SMACK TECHNOLOGIES" -> "Smack Technologies"
const titled = (s: string) =>
	s
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const grid = html.match(GRID)?.[1];
	if (!grid) {
		throw new Error('firstin: the home page has no portfolio grid — the layout moved');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, comment, attrs, inner] of grid.matchAll(SLOT)) {
		const label = clean(attrs.match(LABEL)?.[1] ?? '').replace(/[-–\s]*acquired$/i, '');
		const heading = clean(comment).replace(BUYER, '').trim();
		const name = label || titled(heading);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const acquired = ACQUIRED.test(attrs) || ACQUIRED.test(inner);
		const buyer = clean(comment).match(BUYER)?.[1] ?? '';
		companies.push({
			name,
			category: acquired ? [buyer ? `Acquired by ${titled(buyer)}` : 'Acquired', 'Exited'].join(', ') : '',
			url: unescape(attrs.match(HREF)?.[1] ?? '').trim()
		});
	}

	if (companies.length === 0) {
		throw new Error('firstin: no companies in the portfolio grid');
	}

	return companies;
}
