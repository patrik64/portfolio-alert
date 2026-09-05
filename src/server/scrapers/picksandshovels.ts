import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.picksandshovelsvc.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js, rendered on the server, so the portfolio is a run of cards on the
// front page: a logo linked to the company, its name and the stage the fund
// came in at.
//
// the fund marks two things beside a name and says what one of them means at
// the top of the section — "* = angel investment". the other is written into
// the name itself, "Skip (acq)", which is how the investment ended rather than
// what the company is called, so both move to the category and the name stays
// what it would be either way.
//
// the page carries a second run of the same cards as react's own payload, with
// its quotes escaped, so matching an unescaped class attribute reads each
// company once.

const CARD = /<a href="(https?:\/\/[^"]+)"[^>]*class="box group[^"]*">([\s\S]*?)<\/a>/g;
const NAME = /<p class="text-body-sm font-medium text-ink">([\s\S]*?)<\/p>/;
const STAGE = /<p class="mono-label[^"]*">([^<]*)<\/p>/;
// the mark the fund puts on a company it came into as an angel
const ANGEL = /class="text-accent">\*</;
const ACQUIRED = /\s*\(\s*acq(?:uired)?\.?\s*\)\s*$/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]*>/g, ''))
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a stage written with a comma in it would
// read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const m of html.matchAll(CARD)) {
		const card = m[2];
		const written = card.match(NAME)?.[1] ?? '';

		const angel = ANGEL.test(written);
		// the asterisk is the mark itself, not part of the name
		const listed = clean(written).replace(/\*+$/, '').trim();
		const acquired = ACQUIRED.test(listed);
		const name = listed.replace(ACQUIRED, '').trim();
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: [
				tag(card.match(STAGE)?.[1] ?? ''),
				angel ? 'Angel investment' : '',
				acquired ? 'Acquired' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: m[1]
		});
	}

	if (companies.length === 0) {
		throw new Error('picksandshovels: no companies on the portfolio page');
	}

	return companies;
}
