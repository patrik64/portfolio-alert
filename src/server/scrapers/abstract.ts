import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.abstract.com/companies-list/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the companies page is a table, a row a
// company, with its sectors ("AI, Frontier Tech"), the round the fund came
// in at ("Seed") and, for the ones the fund is out of, how and when
// ("Acquired by Airtable in 2024", "IPO in 2026", or a ticker, "HIPO in
// 2020"), kept without the year; the sectors and the round are kept as
// tags. each row opens a panel served with the page, keyed by the same
// id, whose "Visit Website" links the company's site. a few names are
// written with their buyer, "Neon / Databricks", and are kept as written.

const ROW = /<div class="all-companies__item js-open-modal-companies" data-company-id="([^"]*)">([\s\S]*?)<div class="all-companies__item-exited[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
const NAME = /class="title"[^>]*>([\s\S]*?)<\/h2>/;
const SECTOR = /all-companies__item-sector[^"]*"[^>]*>([\s\S]*?)<\/div>/;
const ROUND = /all-companies__item-partnered[^"]*"[^>]*>([\s\S]*?)<\/div>/;
const PANEL = /<div class="all-companies-modal__item" data-company-id="([^"]*)">([\s\S]*?)(?=<div class="all-companies-modal__item" data-company-id=|$)/g;
const WEBSITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*>\s*Visit Website\s*<\/a>/i;
const YEAR = /\s+in\s+(?:19|20)\d{2}\s*$/i;
const TICKER = /^[A-Z]{2,5}$/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// "Acquired by Airtable in 2024" -> "Acquired by Airtable", "HIPO in 2020" -> "IPO (HIPO)"
function outcome(said: string): string {
	const went = said.replace(YEAR, '').trim();
	if (/^ipo$/i.test(went)) return 'IPO';
	if (TICKER.test(went)) return `IPO (${went})`;
	return went;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const sites = new Map<string, string>();
	for (const [, id, panel] of html.matchAll(PANEL)) {
		const site = unescape(panel.match(WEBSITE)?.[1] ?? '').trim();
		if (/^https?:\/\//i.test(site) && !sites.has(id)) sites.set(id, site);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, id, row, exited] of html.matchAll(ROW)) {
		const name = clean(row.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const list = (field: RegExp) =>
			clean(row.match(field)?.[1] ?? '')
				.split(/\s*,\s*/)
				.filter(Boolean);
		const said = clean(exited);
		const went = said ? outcome(said) : '';
		companies.push({
			name,
			category: [...list(SECTOR), ...list(ROUND), went, went ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: sites.get(id) ?? PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('abstract: no companies in the table');
	}

	return companies;
}
