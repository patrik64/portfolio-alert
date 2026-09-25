import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://elevateventures.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the portfolio page is one long table, a
// row per company — the name, linking its site, the stage the fund came in
// at ("Pre-Seed", "Seed+"), a sector ("Life Science") and a status: active,
// exited, or acquired, which is kept as the outcome. the filters run in the
// browser, so the page holds every row.

const ROW = /(?=<div class="port-row filter)/;
const COLUMN = /<div class="port-col(\d)">([\s\S]*?)<\/div>/g;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const OUTCOME = /^(exited|exit|acquired|ipo|merged)\b/i;
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
		// a row ends where its last column does
		const row = chunk.split('</div>\n</div>')[0];
		const columns = new Map([...row.matchAll(COLUMN)].map(([, n, body]) => [n, body]));
		const name = clean(columns.get('1') ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const status = tag(columns.get('4') ?? '');
		const exited = OUTCOME.test(status);
		companies.push({
			name,
			category: [
				tag(columns.get('3') ?? ''),
				tag(columns.get('2') ?? ''),
				exited && !/^exit(ed)?$/i.test(status) ? status : '',
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: unescape(row.match(LINK)?.[1] ?? '') || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('elevate: no companies on the portfolio page');
	}

	return companies;
}
