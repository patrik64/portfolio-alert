import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.celesta.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, relaid on 2026-10-31: the portfolio page holds every company as a
// card — its name, its sectors ("AI Infrastructure"), its status, "Active",
// "Exited" or "IPO", and under an IPO sometimes the listing ("NASDAQ: CRDO") —
// and the filter runs in the browser. the page writes the list out twice, as
// rows and as this grid, and only the grid has the listing. a card links the
// company's page on the fund's site, which gives the year the fund came in,
// where the company is based and its site, the first of its buttons that isn't
// a social network; those pages are fetched one at a time, and a page that will
// not load leaves its company linking to it.

const CARD = /(?=<div\b[^>]*\bclass="grid_item_link w-dyn-item")/;
const NAME = /\bfs-list-field="name"[^>]*>([\s\S]*?)<\/div>/;
const PAGE = /\bhref="(\/portfolio\/[^"]+)"/;
const SECTOR = /\bfs-list-value="([^"]*)"\s+fs-list-field="sector"/g;
const STATUS = /\bclass="port_status\b[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
const INVESTED = />Initial Investment<\/div>\s*<div\b[^>]*>\s*((?:19|20)\d{2})\b/;
const PLACE = />location<\/div>\s*<div\b[^>]*>([^<]*)</;
const BUTTON = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*\bclass="transparent_button\b/g;
const SOCIAL = /^https?:\/\/(?:[a-z]+\.)?(?:linkedin|twitter|x|facebook|instagram|youtube)\.com\//i;
const STEALTH = /^stealth\b/i;

// companies stored from the old page under the names it gave them
const STORED_AS: Record<string, string> = {
	hioctave: 'HiO'
};

interface Details {
	site: string;
	invested: string;
	place: string;
}

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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// what the company's page on the fund's site says of it, or nothing when the
// page will not load; a refusal is waited out once
async function detailsOf(page: string): Promise<Details> {
	const nothing = { site: '', invested: '', place: '' };
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const resp = await fetch(page, { headers: { 'User-Agent': UA } });
			if (resp.status === 429 && attempt === 0) {
				await resp.body?.cancel();
				await wait(REFUSED_MS);
				continue;
			}
			if (!resp.ok) return nothing;
			const html = await resp.text();
			const buttons = [...html.matchAll(BUTTON)].map(([, href]) => unescape(href).trim());
			return {
				site: buttons.find((href) => !SOCIAL.test(href)) ?? '',
				invested: html.match(INVESTED)?.[1] ?? '',
				place: tag(html.match(PLACE)?.[1] ?? '')
			};
		} catch {
			return nothing;
		}
	}
	return nothing;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const shown = clean(card.match(NAME)?.[1] ?? '');
		const name = STORED_AS[shown.toLowerCase()] ?? shown;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		// the status comes first, and under it a listing where there is one
		const [status = '', listing = ''] = [...card.matchAll(STATUS)].map(([, line]) => tag(line));
		const listed = /^ipo$/i.test(status);
		const path = card.match(PAGE)?.[1];
		const page = path ? `${BASE_URL}${unescape(path)}` : PAGE_URL;
		if (path) await wait(PACE_MS);
		const details = path ? await detailsOf(page) : { site: '', invested: '', place: '' };
		companies.push({
			name,
			category: [
				...[...card.matchAll(SECTOR)].map(([, sector]) => tag(sector)),
				details.invested ? `Invested ${details.invested}` : '',
				details.place,
				listed ? 'IPO' : '',
				listing,
				listed || /^exit/i.test(status) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: details.site || page
		});
	}
	if (companies.length === 0) {
		throw new Error('celesta: no companies on the portfolio page');
	}

	return companies;
}
