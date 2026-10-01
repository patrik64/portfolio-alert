import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.airtree.vc';
const PAGE_URL = `${BASE_URL}/companies`;
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the companies page is a grid of cards, sixty to a page with a
// "Load more" link to the next, each naming the company, with its sectors
// ("Software", "AI & ML"), the year it was founded, the round and the year
// the fund partnered with it ("Series A, 2019"), and in a hidden field the
// fund's word for where it stands, "Early-stage", "Growth", or "Acquired"
// and "Public" for the ones it is out of. the sectors, the standing, the
// round, "Invested 2019" and "Founded 2015" are kept as tags. each card
// links the company's page on the fund's site, whose "Website" link is
// its own site; those pages are fetched one at a time, and a page that
// will not load leaves its company linking to it. a page of the list that
// will not load fails the run.

const CARD = /(?=<div\b[^>]*\bportfolio-item=""[^>]*\brole="listitem")/;
const CARD_END = 'class="cms-link';
const NAME = /fs-cmsfilter-field="name"[^>]*>([\s\S]*?)<\/div>/;
const STANDING = /fs-cmsfilter-field="funding"[^>]*>([\s\S]*?)<\/div>/;
const SECTOR = /fs-cmsfilter-field="sector"[^>]*>([\s\S]*?)<\/div>/g;
const FOUNDED = /class="cd2 ct3-cl2-cp1"[^>]*>\s*<div class="text-labels-medium">([\s\S]*?)<\/div>/;
const PARTNERED = /class="cd2 ct2-cp1-is-alignright"[^>]*>\s*<div class="text-labels-medium">([\s\S]*?)<\/div>/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="cms-link\b/;
const NEXT = /<a\b[^>]*\bhref="(\?\w+_page=\d+)"[^>]*\bclass="w-pagination-next\b/;
const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
const HREF = /\bhref="([^"]*)"/;
const OUT = /^(?:acquired|public|ipo|merged|exited)\b/i;
const STEALTH = /^stealth\b/i;
const MAX_PAGES = 20;

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

const hostOf = (url: string) => {
	try {
		return new URL(url).hostname.toLowerCase();
	} catch {
		return '';
	}
};

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

// the company's site, from the "Website" link on its page on the fund's
// site, or nothing when the page will not load; a refusal is waited out
// once
async function siteOf(page: string): Promise<string> {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const resp = await fetch(page, { headers: { 'User-Agent': UA } });
			if (resp.status === 429 && attempt === 0) {
				await resp.body?.cancel();
				await wait(REFUSED_MS);
				continue;
			}
			if (!resp.ok) return '';
			for (const [, attributes, body] of (await resp.text()).matchAll(ANCHOR)) {
				if (!/^website$/i.test(clean(body))) continue;
				const site = unescape(attributes.match(HREF)?.[1] ?? '').trim();
				if (/^https?:\/\//i.test(site) && !/(?:^|\.)airtree\.vc$/i.test(hostOf(site))) return site;
			}
			return '';
		} catch {
			return '';
		}
	}
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const cards: string[] = [];
	let url = PAGE_URL;
	for (let page = 1; page <= MAX_PAGES; page++) {
		const html = await fetchText(url);
		for (const chunk of html.split(CARD).slice(1)) {
			const end = chunk.indexOf(CARD_END);
			cards.push(end < 0 ? chunk.slice(0, 6000) : chunk.slice(0, chunk.indexOf('>', end) + 1));
		}
		const next = html.match(NEXT)?.[1];
		if (!next) break;
		url = `${PAGE_URL}${next}`;
		await wait(PACE_MS);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of cards) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const standing = tag(card.match(STANDING)?.[1] ?? '');
		const out = OUT.test(standing);
		// "Series A, 2019" -> "Series A", 2019
		const partnered = clean(card.match(PARTNERED)?.[1] ?? '');
		const invested = partnered.match(/\b(?:19|20)\d{2}\b/)?.[0];
		const round = partnered.replace(/\s*,?\s*\b(?:19|20)\d{2}\b\s*$/, '').trim();
		const founded = clean(card.match(FOUNDED)?.[1] ?? '').match(/\b(?:19|20)\d{2}\b/)?.[0];
		const href = unescape(card.match(LINK)?.[1] ?? '').trim();
		const page = href ? new URL(href, BASE_URL).href : '';
		if (page) await wait(PACE_MS);
		const site = page ? await siteOf(page) : '';
		companies.push({
			name,
			category: [
				...[...card.matchAll(SECTOR)].map(([, sector]) => tag(sector)),
				standing,
				tag(round),
				invested ? `Invested ${invested}` : '',
				founded ? `Founded ${founded}` : '',
				out ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: site || page || PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('airtree: no companies on the companies page');
	}

	return companies;
}
