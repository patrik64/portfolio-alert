import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.fprimecapital.com';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const BATCH_SIZE = 6;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the whole portfolio is one page of logos, each linking the
// company's page here under the company's name, with a line about it and,
// for one that has been sold or listed, how ("Acquired by Eagle
// Pharmaceuticals / EURONEXT: ACPH", "NASDAQ: TOST"). the list names no
// company's own site — that is on the company's page, one of hundreds — so a
// company links to its page here. what the fund files a company under is
// only in the filters, each a page of its own listing the companies it
// holds: the sectors, the fund's categories, the regions, and the status,
// "Acquired" and "Public" being the companies the fund is out of. those
// pages are read in batches; one that will not load costs its label for the
// night, not the fetch. a note that is not an exit ("Formerly Capital Rx")
// is not kept.

const ITEM = /(?=<div[^>]*class="[^"]*\bportfolio_item\b(?!_))/;
const LINK = /<a\b[^>]*\bhref="([^"]+)"[^>]*\btitle="([^"]*)"/;
const NOTE = /class="[^"]*\bportfolio_item_nasdaq\b[^"]*"[^>]*>([\s\S]*?)<\/div>/;
// a filter: its page and the label beside it
const FILTER =
	/<a\b[^>]*\bhref="(https:\/\/www\.fprimecapital\.com\/portfolio\/(team_sector|portfolio_category|portfolio_region|portfolio_status)-[^"#/]+\/)[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
const EXITED_STATUS = /^(acquired|public)$/i;
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

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

interface Listed {
	name: string;
	page: string;
	note: string;
}

function listed(html: string): Listed[] {
	return html
		.split(ITEM)
		.slice(1)
		.flatMap((item) => {
			const link = item.match(LINK);
			const name = clean(link?.[2] ?? '');
			if (!link || !name) return [];
			return [{ name, page: unescape(link[1]), note: tag(item.match(NOTE)?.[1] ?? '') }];
		});
}

interface Filter {
	url: string;
	group: string;
	label: string;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);
	const companies = listed(html);
	if (companies.length === 0) {
		throw new Error('fprime: no companies on the portfolio page');
	}

	const filters = new Map<string, Filter>();
	for (const [, url, group, label] of html.matchAll(FILTER)) {
		if (!filters.has(url)) filters.set(url, { url, group, label: tag(label) });
	}

	// each company's page, with the labels of the filters listing it
	const labels = new Map<string, { group: string; label: string }[]>();
	const pending = [...filters.values()];
	for (let i = 0; i < pending.length; i += BATCH_SIZE) {
		const batch = pending.slice(i, i + BATCH_SIZE);
		const pages = await Promise.all(batch.map((f) => fetchText(f.url).catch(() => '')));
		batch.forEach((filter, j) => {
			for (const { page } of listed(pages[j])) {
				labels.set(page, [...(labels.get(page) ?? []), filter]);
			}
		});
	}

	const result: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const company of companies) {
		if (STEALTH.test(company.name) || seen.has(company.name.toLowerCase())) continue;
		seen.add(company.name.toLowerCase());
		const filed = labels.get(company.page) ?? [];
		const exited = filed.some((f) => f.group === 'portfolio_status' && EXITED_STATUS.test(f.label));
		result.push({
			name: company.name,
			category: [
				...filed.filter((f) => f.group === 'team_sector').map((f) => f.label),
				...filed.filter((f) => f.group === 'portfolio_category').map((f) => f.label),
				...filed.filter((f) => f.group === 'portfolio_region').map((f) => f.label),
				exited ? company.note : '',
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: company.page
		});
	}

	return result;
}
