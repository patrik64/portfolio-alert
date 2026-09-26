import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://passioncapital.com/fund-portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the portfolio page holds every company
// as a tile whose link carries the record in data attributes — the name,
// a line about it, a status "Active" or "Alumni", the year founded, the
// year invested, its industries, the fund it sits in and its site. the
// filters run in the browser. an alumnus is an exit; nothing says how.

// one attribute's value holds markup, "<p>2022</p>", so the tag is read quote-aware
const LINK = /<a\b(?:\s+[a-z-]+="[^"]*")*\s+class="portfolio-link"(?:\s+[a-z-]+="[^"]*")*\s*>/g;
const ATTR = /\bdata-([a-z-]+)="([^"]*)"/g;
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
	for (const [link] of html.matchAll(LINK)) {
		const data = new Map([...link.matchAll(ATTR)].map(([, key, value]) => [key, clean(value)]));
		const name = data.get('title') ?? '';
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const invested = data.get('investment')?.match(/\b(?:19|20)\d{2}\b/)?.[0];
		const founded = data.get('founded')?.match(/\b(?:19|20)\d{2}\b/)?.[0];
		companies.push({
			name,
			category: [
				tag(data.get('indus-terms') ?? ''),
				tag(data.get('fund-terms') ?? ''),
				founded ? `Founded ${founded}` : '',
				invested ? `Invested ${invested}` : '',
				/^alumni$/i.test(data.get('status') ?? '') ? 'Exited' : ''
			]
				.filter((t, k, all) => t && all.indexOf(t) === k)
				.join(', '),
			url: data.get('website-link') || PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('passion: no companies on the portfolio page');
	}

	return companies;
}
