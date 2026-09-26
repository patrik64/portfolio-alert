import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.crv.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js over sanity, rendered on the server: the companies page is one
// long list of rows that unfold — the name as a heading; unfolded, a line
// about the company, a link to its site, its founders and a timeline of
// dated lines: founded, partnered, and on one the fund is out of "Acquired
// by Cisco" or "IPO (BRDS)". the founding and partnering years and the
// exit are kept as tags; a row without a site links to its place on the
// page. the fund files companies under nothing else.

const ROW = /(?=<div class="relative grid grid-cols-4 w-full cursor-pointer items-center)/;
const NAME = /<h3\b[^>]*class="[^"]*\btext-h3\b[^"]*"[^>]*>([\s\S]*?)<\/h3>/;
const ANCHOR = /aria-controls="company-accordion-([^"]+)"/;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const TIMELINE = /Timeline<\/h4>\s*<div[^>]*>([\s\S]*?)<\/div>/;
const ENTRY = /<p[^>]*>([\s\S]*?)<\/p>/g;
const EXIT = /\b(acquired by .+|acquired|merged .+|ipo\b.*|went public.*|spac.*)$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) =>
	unescape(s.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

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
	for (const row of html.split(ROW).slice(1)) {
		const name = clean(row.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		// "2013 - Founded", "May 2018 - Acquired by Cisco": a date, then the event
		const entries = [...(row.match(TIMELINE)?.[1] ?? '').matchAll(ENTRY)].map((m) => clean(m[1]));
		const events = entries.map((entry) => {
			const [, date, event] = entry.match(/^(.*?)\s+-\s+(.+)$/) ?? [undefined, '', entry];
			return { year: date.match(/\b(?:19|20)\d{2}\b/)?.[0] ?? '', event: event.trim() };
		});
		const founded = events.find((e) => /^founded/i.test(e.event))?.year;
		const partnered = events.find((e) => /^partnered/i.test(e.event))?.year;
		const outcome = events.map((e) => e.event.match(EXIT)?.[1] ?? '').find(Boolean) ?? '';
		const slug = row.match(ANCHOR)?.[1];
		companies.push({
			name,
			category: [
				founded ? `Founded ${founded}` : '',
				partnered ? `Invested ${partnered}` : '',
				outcome ? tag(outcome[0].toUpperCase() + outcome.slice(1)) : '',
				outcome ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: unescape(row.match(LINK)?.[1] ?? '') || (slug ? `${PAGE_URL}?company=${slug}#${slug}` : PAGE_URL)
		});
	}

	if (companies.length === 0) {
		throw new Error('crv: no companies on the companies page');
	}

	return companies;
}
