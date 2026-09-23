import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.gradient.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// google's own site builder, rendered on the server: every company is a row
// marked data-portfolio-row, the featured ones shown and the rest hidden
// until "All" is pressed. a row names the company in a link to its site,
// says what it does and the year the fund came in ("Partnered 2018"), and
// for one bought says by whom ("Acquired by Snowflake"), which is kept with
// the Exited tag. the rows' classes are hashed by the build, so only the
// data attribute and the text are relied on.

const ROW = /(?=<div\b[^>]*\bdata-portfolio-row="true")/;
const NAME = /<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/;
// a div's own text, its inline markup and all ("Acquired by <em>DATAROBOT</em>")
const TEXT = /<div\b[^>]*>((?:(?!<\/?div\b)[\s\S])*?)<\/div>/g;
const OUTCOME = /^(acquired|merged|ipo)\b/i;
const PARTNERED = /^partnered\s+(\d{4})$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a note holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const chunk of html.split(ROW).slice(1)) {
		// the last row runs on to the end of the list
		const row = chunk.split('</section>')[0];
		const link = row.match(NAME);
		const name = clean(link?.[2] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const texts = [...row.matchAll(TEXT)].map((m) => clean(m[1]));
		const outcome = tag(texts.find((t) => OUTCOME.test(t)) ?? '');
		const year = texts.map((t) => t.match(PARTNERED)?.[1]).find(Boolean);
		const url = unescape(link?.[1] ?? '');
		companies.push({
			name,
			category: [year ? `Invested ${year}` : '', outcome, outcome ? 'Exited' : ''].filter(Boolean).join(', '),
			url: /^https?:\/\//.test(url) ? url : ''
		});
	}

	if (companies.length === 0) {
		throw new Error('gradient: no companies on the portfolio page');
	}

	return companies;
}
