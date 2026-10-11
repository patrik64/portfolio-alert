import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.nautacapital.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the list's pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const MAX_PAGES = 50;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page lists two dozen companies at a time, with a
// link to the next two dozen ("?785a2d0f_page=2", the parameter read from
// the link each run). a company's card carries what the page filters by —
// its industry ("AI/ML & Data", "RetailTech"), the year it was founded, its
// stage ("Seed", "Series A"), its status, "Active" or "Exited", and its
// country ("UK", "Spain") — and its name, its site and one year, shown as
// "Invested in 2022" or, for an exit, "Exited in 2021". the industry, the
// stage, the country and the years are kept as tags, an exit with the
// Exited tag; a name noting its buyer ("Geoblink (acquired by Mytraffic)")
// is kept without the note, the buyer as a tag. a card linking only a
// profile on crunchbase, or nothing, links the list. a page of the list
// that will not load fails the run, as the list would be short.

const CARD = /(?=<div role="listitem" class="portfolio_collection-item w-dyn-item">)/;
const FIELD = (name: string) => new RegExp(`fs-cmsfilter-field="${name}"[^>]*>([\\s\\S]*?)<\\/div>`);
const NAME = /class="portfolio_hover-heading"[^>]*>([\s\S]*?)<\/div>/;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="portfolio_item-wrapper\b/;
// the year as shown: the embed the card does not hide
const INVESTED = /<div class="html-embed-2 w-embed"><p>\s*Invested in\s+((?:19|20)\d{2})/;
const NEXT = /<a\b[^>]*\bhref="\?(\w+_page=\d+)"[^>]*\bclass="[^"]*\bw-pagination-next\b/;
// "Geoblink (acquired by Mytraffic)" -> "Geoblink", "Mytraffic"
const NOTED_BUYER = /^(.+?)\s*\(\s*acquired by\s+([^)]+?)\s*\)$/i;
const PROFILE = /^(?:[\w-]+\.)*crunchbase\.com$/i;
const EXITED = /^exit(?:ed)?$/i;
const UNSAID = /^(?:-|other|others|all|n\/a|active)$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// a page, or a refusal waited out once
async function get(url: string): Promise<Response> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (resp.status !== 429) return resp;
	await resp.body?.cancel();
	await wait(REFUSED_MS);
	return fetch(url, { headers: { 'User-Agent': UA } });
}

// the company's own site, or nothing for a profile or a bare "#"
function siteOf(href: string): string {
	try {
		const url = new URL(unescape(href).trim());
		return /^https?:$/.test(url.protocol) && !PROFILE.test(url.hostname) ? url.href : '';
	} catch {
		return '';
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let url = PAGE_URL;
	for (let page = 1; page <= MAX_PAGES; page++) {
		const resp = await get(url);
		if (!resp.ok) {
			throw new Error(`nauta: page ${page} of the portfolio would not load (${resp.status})`);
		}
		const html = await resp.text();
		const cards = html.split(CARD).slice(1);
		if (cards.length === 0) {
			throw new Error(`nauta: no companies on page ${page} of the portfolio — the markup moved`);
		}
		for (const card of cards) {
			const written = clean(card.match(NAME)?.[1] ?? '');
			const [, bare, buyer] = written.match(NOTED_BUYER) ?? [];
			const name = bare ?? written;
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const field = (key: string) => clean(card.match(FIELD(key))?.[1] ?? '');
			const founded = field('founded').match(/\b(?:19|20)\d{2}\b/)?.[0];
			const invested = card.match(INVESTED)?.[1];
			const out = EXITED.test(field('status')) || !!buyer;
			companies.push({
				name,
				category: [
					tag(field('industry')),
					tag(field('stage')),
					tag(field('location')),
					founded ? `Founded ${founded}` : '',
					invested ? `Invested ${invested}` : '',
					buyer ? `Acquired by ${tag(buyer)}` : '',
					out ? 'Exited' : ''
				]
					.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
					.join(', '),
				url: siteOf(card.match(SITE)?.[1] ?? '') || PAGE_URL
			});
		}
		const next = html.match(NEXT)?.[1];
		if (!next) break;
		url = `${PAGE_URL}?${next}`;
		await wait(PACE_MS);
	}

	if (companies.length === 0) {
		throw new Error('nauta: no companies on the portfolio page');
	}

	return companies;
}
