import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://elizabethstreet.vc/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a site of its own, one page: under "Current Portfolio" every company is a
// tile linking its site, with a line about it — which, on one sold, ends
// "(acquired by Bilt)" — and, beneath, a category in capitals ("FINTECH /
// GAMING") and the name. the "Select Partner Investments" that follow are
// the partners' own earlier deals, logos with no names, and are left out.

const SECTION = /<section id="portfolio">([\s\S]*?)(?=<section\b|$)/;
const ITEM = /(?=<a\b[^>]*\bclass="portfolio-item\b)/;
const LINK = /^<a\b[^>]*\bhref="([^"]*)"/;
const LINE = /class="top"[^>]*>\s*<h3>([\s\S]*?)<\/h3>/;
const CATEGORY = /class="text-wrapper"[^>]*>\s*<h4>([\s\S]*?)<\/h4>/;
const NAME = /class="text-wrapper"[^>]*>[\s\S]*?<h3>([\s\S]*?)<\/h3>/;
const OUTCOME = /\(((?:acquired|merged|exited|ipo)\b[^)]*)\)\s*$/i;
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

// "HEALTH & WELLNESS" as Health & Wellness, an initialism kept as it is
const titled = (s: string) =>
	s.replace(/[^\s&/]+/g, (word) => (word.length <= 2 ? word : word[0] + word.slice(1).toLowerCase()));

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const section = html.match(SECTION)?.[1] ?? '';

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const chunk of section.split(ITEM).slice(1)) {
		const item = chunk.split('</a>')[0];
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const outcome = clean(item.match(LINE)?.[1] ?? '').match(OUTCOME)?.[1] ?? '';
		companies.push({
			name,
			category: [
				...clean(item.match(CATEGORY)?.[1] ?? '')
					.split('/')
					.map((t) => titled(tag(t))),
				outcome ? tag(outcome[0].toUpperCase() + outcome.slice(1)) : '',
				outcome ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: unescape(item.match(LINK)?.[1] ?? '').trim() || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('elizabethstreet: no companies under the portfolio heading');
	}

	return companies;
}
