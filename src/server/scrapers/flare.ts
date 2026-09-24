import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.flarecapital.com/companies/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the companies page is a table, each row a
// link to the company's site carrying its logo — whose alt text names it as
// the company writes it, where the row's own name is set in capitals — its
// category, the round the fund came in at, its status ("Private",
// "Acquired", "IPO", "Exited") and the year. a row held through the fund's
// scholars programme says so in its data, and is filed as "Flare Scholars".
// the same companies are drawn again as cards for small screens, which are
// not read.

const ROW = /(?=<a\b[^>]*class="flare-portfolio-table__row")/;
const OPENING = /^<a\b[^>]*>/;
const LOGO = /<img\b[^>]*\balt="([^"]+)"/;
const field = (name: string) =>
	new RegExp(`class="flare-portfolio-table__row-${name}">([\\s\\S]*?)<\\/span>`);
const NAME = field('name');
const CATEGORY = field('cat');
const ROUND = field('type');
const STATUS = field('status');
const YEAR = field('date');
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
	for (const chunk of html.split(ROW).slice(1)) {
		const row = chunk.split('</a>')[0];
		const opening = row.match(OPENING)?.[0] ?? '';
		const name = clean(row.match(LOGO)?.[1] || row.match(NAME)?.[1] || '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const status = tag(row.match(STATUS)?.[1] ?? '');
		const year = clean(row.match(YEAR)?.[1] ?? '').match(/\b(?:19|20)\d{2}\b/)?.[0];
		const href = unescape(opening.match(/\bhref="([^"]*)"/)?.[1] ?? '');
		companies.push({
			name,
			category: [
				tag(row.match(CATEGORY)?.[1] ?? ''),
				tag(row.match(ROUND)?.[1] ?? ''),
				year ? `Invested ${year}` : '',
				/scholar/i.test(opening.match(/data-holdings="([^"]*)"/)?.[1] ?? '') ? 'Flare Scholars' : '',
				/^(acquired|ipo)$/i.test(status) ? status : '',
				/^(acquired|ipo|exited)$/i.test(status) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//.test(href) ? href : ''
		});
	}

	if (companies.length === 0) {
		throw new Error('flare: no companies in the portfolio table');
	}

	return companies;
}
