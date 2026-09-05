import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://rre.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_PAGES = 30;

// webflow, and the page runs two finsweet lists over the same two hundred and
// fifty companies. the cards name them and give their sectors, fifty at a
// time; the modals behind the cards give their addresses, twenty at a time.
// both are walked and joined on the name, which each writes identically.
//
// the fund writes how a company left into its name — "(Acquired)", or the
// ticker it trades under, "(NASDAQ: DDOG)". that moves into the category, so a
// company keeps its name the day it is bought or floats.
//
// one of the sector tags, "Featured", says where the fund shows a company
// rather than what it does.

const CARD_LIST = '155d7971_page';
const MODAL_LIST = '79e6a7d8_page';
const CARD = '<div role="listitem" class="portfolio_company-item w-dyn-item">';
const MODAL = '<div class="portfolio_modal-container"';
const CARD_NAME = /<h3 fs-list-field="name"[^>]*>([^<]*)<\/h3>/;
const CATEGORY = /fs-list-field="category">([^<]*)<\/div>/g;
const MODAL_NAME = /<h[1-4][^>]*>([\s\S]{0,80}?)<\/h[1-4]>/;
const MODAL_SITE = /<a[^>]*href="(https?:\/\/[^"]+)"/;
// the fund's own display flag, not a sector
const DISPLAY_FLAG = /^featured$/i;
// "(Acquired)" or a ticker, both of which say the company has left
const LEFT = /\s*\((acquired|(?:nasdaq|nyse|ipo|lse|amex)\s*:[^)]*)\)\s*$/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]+>/g, ''))
		.replace(/\s+/g, ' ')
		.trim();

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

async function fetchPage(list: string, page: number): Promise<string> {
	const url = `${PAGE_URL}?${list}=${page}`;
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

// a finsweet list walked until a page adds nobody new; the last page keeps
// offering a next link, so the count of new names is what ends it
async function walk<T>(
	list: string,
	split: string,
	read: (block: string) => [string, T] | null,
	into: Map<string, T>
) {
	for (let page = 1; page <= MAX_PAGES; page++) {
		const html = await fetchPage(list, page);
		const blocks = html.split(split).slice(1);
		if (blocks.length === 0) break;
		let added = 0;
		for (const block of blocks) {
			const found = read(block);
			if (!found) continue;
			const [key, value] = found;
			if (!key || into.has(key)) continue;
			into.set(key, value);
			added++;
		}
		if (added === 0) break;
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const sectors = new Map<string, string[]>();
	await walk(
		CARD_LIST,
		CARD,
		(block) => {
			const name = clean(block.match(CARD_NAME)?.[1] ?? '');
			return name ? [name, [...block.matchAll(CATEGORY)].map((m) => clean(m[1]))] : null;
		},
		sectors
	);

	const sites = new Map<string, string>();
	await walk(
		MODAL_LIST,
		MODAL,
		(block) => {
			const name = clean(block.match(MODAL_NAME)?.[1] ?? '');
			return name ? [name, block.match(MODAL_SITE)?.[1] ?? ''] : null;
		},
		sites
	);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [written, tags] of sectors) {
		const left = written.match(LEFT)?.[1];
		const name = clean(written.replace(LEFT, ''));
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: [
				...tags.filter((t) => t && !DISPLAY_FLAG.test(t)),
				left ? capitalize(clean(left)) : ''
			]
				.filter(Boolean)
				.join(', '),
			url: sites.get(written) ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('rre: no companies on the portfolio page');
	}

	return companies;
}
