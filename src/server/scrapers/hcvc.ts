import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.hcvc.co/pages/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a plain table, one row per investment: the company — linked to its site —
// its country as a two-letter code, the vintage, the round the fund came in
// at, and its status: "Active", or "Acquired" with the buyer or its listing
// after it ("Acquired (NYSE:CNHI)"). a company still in stealth is a row
// named "Stealth (Bio)" and the like, and is left out.

const ROW = /<tr>([\s\S]*?)<\/tr>/g;
const CELL = /<td[^>]*>([\s\S]*?)<\/td>/g;
const COMPANY = /class='company[^']*'>([\s\S]*?)<\/div>/;
const SITE = /href="(https?:\/\/[^"]+)"/;
const STEALTH = /^stealth\b/i;

const countries = new Intl.DisplayNames(['en'], { type: 'region' });

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

// "FR" -> "France"; the site writes the united kingdom "UK", not "GB"
function country(code: string): string {
	const iso = code.toUpperCase() === 'UK' ? 'GB' : code.toUpperCase();
	if (!/^[A-Z]{2}$/.test(iso)) return code;
	try {
		return countries.of(iso) ?? code;
	} catch {
		return code;
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, row] of html.matchAll(ROW)) {
		const cells = [...row.matchAll(CELL)].map((m) => m[1]);
		if (cells.length < 5) continue;
		const name = clean(cells[0].match(COMPANY)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const [where, vintage, round, status] = cells.slice(1, 5).map(clean);
		companies.push({
			name,
			category: [
				tag(round),
				where ? tag(country(where)) : '',
				/^\d{4}$/.test(vintage) ? `Invested ${vintage}` : '',
				/^active$/i.test(status) ? '' : tag(status),
				/acquired|ipo|exited|listed/i.test(status) ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: unescape(cells[0].match(SITE)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('hcvc: no companies in the portfolio table');
	}

	return companies;
}
