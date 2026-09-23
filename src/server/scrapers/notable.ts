import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.notablecap.com/companies';
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow. the page is a set of tabs, each a collection list of logo cards
// that finsweet loads one page under another — featured, all, a tab per
// sector and exited — and the lists are walked here through webflow's own
// "next" links, a tab at a time. a company takes the label of each sector
// tab it is under, and the Exited tag from the exited one; the all tab is
// read too, and a company only a sector tab shows (tiktok) is kept all the
// same. an exited card's badge says how it went ("ACQ. BY IBM",
// "NASDAQ:ABNB"), which is kept; the names carry notes of their own — an
// older name ("fka Slintel"), a newer one ("now Block"), a listing — which
// are not part of them. a card of a company bought outright may link its
// buyer.

const PANE = /(?=<div data-w-tab="[^"]*" class="w-tab-pane)/;
const TAB = /<a\b[^>]*\bdata-w-tab="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
const LIST = /(?=<div[^>]*class="[^"]*\bw-dyn-list\b)/;
const ITEM = /(?=<div[^>]*role="listitem")/;
const NAME = /fs-cmsfilter-field="company"[^>]*>([\s\S]*?)<\/div>/;
const LOGO = /<img\b[^>]*\balt="([^"]+)"/;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*class="c-logo_list_wrap/;
// a badge webflow's conditional visibility leaves showing
const BADGE = /<div class="c-tag cc-stroke"><div class="c-text_xs_new">([\s\S]*?)<\/div>/g;
const NEXT = /href="(\?[a-z0-9_]+_page=\d+)"[^>]*class="[^"]*w-pagination-next/;
const NOTE = /\s*\((?:fka|f\.k\.a\.|formerly|now|nasdaq|nyse|nse)\b[^)]*\)|,\s*acq\.?\s+by\b.*$/gi;
const NOT_SECTORS = /^(featured|all|exited)$/i;
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

// the tabs are written in any case and shown in capitals: "cloud
// infrastructure" -> "Cloud Infrastructure", "AI" stays "AI"
const titled = (s: string) =>
	s.replace(/(^|\s)(\p{Ll})/gu, (_, space, letter) => space + letter.toUpperCase());

// "ACQ. BY IBM" -> "Acquired by IBM"
const outcome = (s: string) => tag(s).replace(/^acq\.?\s+by\s+/i, 'Acquired by ');

interface Card {
	name: string;
	url: string;
	badges: string[];
}

function cards(list: string): Card[] {
	return list
		.split(ITEM)
		.slice(1)
		.flatMap((item) => {
			const name = clean(clean(item.match(NAME)?.[1] || item.match(LOGO)?.[1] || '').replace(NOTE, ''));
			if (!name) return [];
			const link = unescape(item.match(SITE)?.[1] ?? '');
			return [
				{
					name,
					url: /^https?:\/\//.test(link) ? link : '',
					badges: [...item.matchAll(BADGE)].map((m) => clean(m[1])).filter(Boolean)
				}
			];
		});
}

// the tab's list on one page of the page, and the address of its next
function paneList(html: string, tab: string): { cards: Card[]; next: string } {
	const pane =
		html
			.split(PANE)
			.slice(1)
			.find((p) => p.startsWith(`<div data-w-tab="${tab}"`)) ?? '';
	const list = pane.split(LIST)[1] ?? '';
	return { cards: cards(list), next: list.match(NEXT)?.[1] ?? '' };
}

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);
	const tabs = [...html.matchAll(TAB)].map(([, tab, label]) => ({ tab, label: titled(tag(label)) }));
	if (tabs.length === 0) {
		throw new Error('notable: the companies page has no tabs — the layout moved');
	}

	type Listed = ScrapedCompany & { labels: string[]; exited: boolean; notes: string[] };
	const companies = new Map<string, Listed>();
	for (const { tab, label } of tabs) {
		if (/^featured$/i.test(label)) continue;
		let { cards: found, next } = paneList(html, tab);
		for (let page = 1; next && page < MAX_PAGES; page++) {
			const more = paneList(await fetchText(`${PAGE_URL}${unescape(next)}`), tab);
			found = found.concat(more.cards);
			next = more.next;
		}
		for (const card of found) {
			if (STEALTH.test(card.name)) continue;
			const key = card.name.toLowerCase();
			let company = companies.get(key);
			if (!company) {
				company = {
					name: card.name,
					category: '',
					url: card.url,
					labels: [],
					exited: false,
					notes: []
				};
				companies.set(key, company);
			}
			if (!company.url) company.url = card.url;
			if (/^exited$/i.test(label)) company.exited = true;
			else if (!NOT_SECTORS.test(label) && !company.labels.includes(label)) company.labels.push(label);
			for (const badge of card.badges.map(outcome)) {
				if (!company.notes.includes(badge)) company.notes.push(badge);
			}
		}
	}

	if (companies.size === 0) {
		throw new Error('notable: no companies in the companies tabs');
	}

	return [...companies.values()].map(({ labels, exited, notes, ...company }) => ({
		...company,
		category: [...labels, ...(exited ? [...notes, 'Exited'] : [])].join(', ')
	}));
}
