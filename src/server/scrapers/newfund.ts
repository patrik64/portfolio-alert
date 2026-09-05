import type { ScrapedCompany } from './types';

const BASE_URL = 'https://newfundcap.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 8;

// drupal. the whole portfolio is on one page — no paging, no load more — but a
// card carries only the company's name and a line about it. what the fund
// knows besides that is in its filters, which are links rather than a form:
// /portfolio/1 is what it still holds, /portfolio/0/0/9 is everything it calls
// SaaS. so each filter is asked for in turn and the companies it comes back
// with are the ones that carry that label.
//
// the filters are read off the page rather than written down here, so a sector
// the fund adds is picked up by itself. three of the five groups are about the
// company and are kept: what state it is in, where it works, and what it does.
// the other two are the year the fund came in and the round the company last
// raised — the shape of the investment rather than the company, and both move
// under a company that has not changed.
//
// a company is Active or Exited, and Active is the state one is in unless
// something has happened, so only Exited is written down. four companies carry
// no label of any kind; they are the newest arrivals and are kept as they are.
//
// the grid links to the fund's own page for a company rather than out to it.
// the company's address is on that page, but there are nearly two hundred of
// them and the filters already cost thirty-eight requests a night, so the
// fund's page is where a reader is sent.
//
// the fund lists itself among its companies, with a page about the firm rather
// than a company it backed. it is left out.

const GRID = /class="card-listing">([\s\S]*?)(?=<nav|<footer|<\/main)/;
const CARD = /<a href="\/company\/([^"]+)" class="open-in">\s*<span>([\s\S]*?)<\/span>/g;
const FILTER = /<ul data-group="([^"]+)" data-cat="([^"]*)"[^>]*>\s*<li><a href="([^"]+)">/g;
// the groups that say something about the company
const KEPT = ['company_tags', 'company_country', 'company_status'];
// the state a company is in unless the fund says otherwise
const DEFAULT_STATE = /^active$/i;
// the fund's own entry in its own portfolio
const THE_FUND = /^newfund$/i;

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

// the companies in the grid, which is the same shape whether the page is
// filtered or not. the page also shows a few of them again at the top as
// highlights, and those sit outside the grid
function listed(html: string): { slug: string; name: string }[] {
	const grid = html.match(GRID)?.[1] ?? '';
	return [...grid.matchAll(CARD)].map((card) => ({ slug: card[1], name: clean(card[2]) }));
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const page = await fetchText(PAGE_URL);

	const filters = [...page.matchAll(FILTER)]
		.filter(([, group, label]) => KEPT.includes(group) && label !== 'All')
		.map(([, group, label, href]) => ({
			group,
			label: clean(label),
			url: `${BASE_URL}${href.replace(/#.*$/, '')}`
		}));
	if (filters.length === 0) {
		throw new Error('newfund: the portfolio page no longer offers its filters');
	}

	const labels = new Map<string, { group: string; label: string }[]>();
	for (let at = 0; at < filters.length; at += BATCH_SIZE) {
		const batch = filters.slice(at, at + BATCH_SIZE);
		const pages = await Promise.all(batch.map((filter) => fetchText(filter.url)));
		batch.forEach((filter, index) => {
			for (const { slug } of listed(pages[index])) {
				labels.set(slug, [...(labels.get(slug) ?? []), filter]);
			}
		});
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const { slug, name } of listed(page)) {
		if (!name || THE_FUND.test(slug) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const held = labels.get(slug) ?? [];
		const category = KEPT.flatMap((group) =>
			held
				.filter((label) => label.group === group)
				.map((label) => label.label)
				.filter((label) => !(group === 'company_status' && DEFAULT_STATE.test(label)))
		);

		companies.push({
			name,
			category: category.join(', '),
			url: `${BASE_URL}/company/${slug}`
		});
	}

	if (companies.length === 0) {
		throw new Error('newfund: no companies in the portfolio grid');
	}

	return companies;
}
