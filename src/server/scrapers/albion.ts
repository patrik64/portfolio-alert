import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://albion.vc/companies/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the companies page lists every company as a row, the whole
// list in the page, giving its name, a link to its site, a line about it,
// its sector ("AI / Data", "Healthtech", "Frontiers Strategy") and its
// status — "Early Stage", "Growth", "Exited" or "IPO"; a few rows add a
// "Learn more" page here. the sector and the stage are kept as tags, a
// listing as IPO and an exit each with the Exited tag. the ticker of exits
// above the list ("Acquired by Apple") shows logos without names, so it
// cannot be told which company each buyer bought. a company without a
// site links its page here, or the list.

const ROW = /(?=<li class="c-company-row\b)/;
const NAME = /class="c-company-row__heading">\s*<span\b[^>]*>([\s\S]*?)<\/span>/;
const SITE = /class="c-company-row__heading">[\s\S]*?<a href="([^"]*)"/;
const COLUMN = (name: string) => new RegExp(`class="c-company-row__column c-company-row__column--${name}">([\\s\\S]*?)</div>`);
const MORE = /<a href="([^"]*)"[^>]*>\s*Learn more\s*<\/a>/;
// the label the row shows on small screens
const LABEL = /^(?:sector|status):\s*/i;
const EXITED = /^exited$/i;
const IPO = /^ipo$/i;
const UNSAID = /^(?:-|–|—|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#8211;|&ndash;/g, '–')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const link = (href: string | undefined) => {
	const url = unescape(href ?? '').trim();
	return /^https?:\/\//i.test(url) ? url : '';
};

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
		const column = (key: string) => clean(row.match(COLUMN(key))?.[1] ?? '').replace(LABEL, '');
		const status = column('status');
		const out = EXITED.test(status) || IPO.test(status);
		companies.push({
			name,
			category: [tag(column('sector')), out ? '' : tag(status), IPO.test(status) ? 'IPO' : '', out ? 'Exited' : '']
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: link(row.match(SITE)?.[1]) || link(row.match(MORE)?.[1]) || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('albion: no companies on the companies page — the markup moved');
	}

	return companies;
}
