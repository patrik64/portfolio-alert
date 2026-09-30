import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://boldstart.vc/companies/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a site of the fund's own: the companies page is a few short lists under
// theme headings — "Cybersecurity", "AI Infra", "Physical AI", "Agents",
// "Weird" — a row a company, linking its site: the name, a line about it
// and the year the fund came in ("Backed since 2015"). a company the fund
// is out of says so on the end of its line, after a dot ("AI security ·
// Acquired by Palo Alto Networks"). a company listed under two themes is
// kept once, with both.

const SECTION = /<h2\b[^>]*\bclass="section-label"[^>]*>([\s\S]*?)<\/h2>|<a\b[^>]*\bclass="company-row"[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
const NAME = /class="company-name"[^>]*>([\s\S]*?)<\/span>/;
const LINE = /class="company-description"[^>]*>([\s\S]*?)<\/span>/;
const YEAR = /class="company-year"[^>]*>([\s\S]*?)<\/span>/;
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

	type Listed = ScrapedCompany & { themes: string[]; rest: string[] };
	const companies = new Map<string, Listed>();
	let theme = '';
	for (const [, heading, href, row] of html.matchAll(SECTION)) {
		if (heading !== undefined) {
			theme = tag(heading);
			continue;
		}
		const name = clean(row.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name)) continue;
		const known = companies.get(name.toLowerCase());
		if (known) {
			if (theme && !known.themes.includes(theme)) known.themes.push(theme);
			continue;
		}
		// the line, and what follows the dot on it: how the fund got out
		const [, ...notes] = clean(row.match(LINE)?.[1] ?? '').split(/\s+·\s+/);
		const exit = notes.find((n) => /^(acquired|merged|ipo)\b/i.test(n)) ?? '';
		const year = clean(row.match(YEAR)?.[1] ?? '').match(/\b(?:19|20)\d{2}\b/)?.[0];
		const site = unescape(href).trim();
		companies.set(name.toLowerCase(), {
			name,
			category: '',
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL,
			themes: theme ? [theme] : [],
			rest: [year ? `Invested ${year}` : '', tag(exit), exit ? 'Exited' : ''].filter(Boolean)
		});
	}
	if (companies.size === 0) {
		throw new Error('boldstart: no companies on the companies page');
	}

	return [...companies.values()].map(({ themes, rest, ...company }) => ({
		...company,
		category: [...themes, ...rest].join(', ')
	}));
}
