import type { ScrapedCompany } from './types';

const BASE_URL = 'https://canvas.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page holds every company as a card — its sector
// ("Fintech", "AI"), its name, a line about it and, now and then, a note:
// how the fund got out ("Acquired by Shopify (SHOP)", a listing, "NYSE:
// DOCS"), an old name ("Formerly Robocorp"), which is not kept, or a word
// on where it went ("Metamorph Partners"), which is. a card links the
// company's page on the fund's site, where its own site is under
// "Website"; those pages are fetched one at a time, and a page that will
// not load leaves its company linking to it.

const CARD = /(?=<div\b[^>]*\bclass="co-item w-dyn-item")/;
const NAME = /<h3\b[^>]*\bclass="card-name\b[^"]*"[^>]*>([\s\S]*?)<\/h3>/;
const SECTOR = /class="label-text"[^>]*>([\s\S]*?)<\/div>/;
const NOTE = /class="ticker-text"[^>]*>([\s\S]*?)<\/div>/;
const PAGE = /<a\b[^>]*\bhref="(\/companies\/[^"]+)"/;
const SITE = />\s*Website\s*<\/div>\s*<\/div>\s*<a\b[^>]*\bhref="([^"]*)"/;
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// what a note says about how the fund got out, if it says anything: "LAZR"
// and "NYSE: DOCS" are listings
function outcome(note: string): { tag: string; exited: boolean } {
	if (!note || /^formerly\b/i.test(note)) return { tag: '', exited: false };
	if (/^(acquired|merged)\b/i.test(note)) return { tag: note, exited: true };
	if (/^(?:(?:NYSE|NASDAQ|Nasdaq)\s*:\s*)?[A-Z]{2,5}$/.test(note)) return { tag: `IPO (${note})`, exited: true };
	return { tag: note, exited: false };
}

// the company's site, from its page on the fund's site, or nothing when the
// page will not load; a refusal is waited out once
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
			const site = unescape((await resp.text()).match(SITE)?.[1] ?? '').trim();
			return /^https?:\/\//i.test(site) ? site : '';
		} catch {
			return '';
		}
	}
	return '';
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
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const said = outcome(tag(card.match(NOTE)?.[1] ?? ''));
		const path = card.match(PAGE)?.[1];
		const page = path ? `${BASE_URL}${unescape(path)}` : PAGE_URL;
		if (path) await wait(PACE_MS);
		const site = path ? await siteOf(page) : '';
		companies.push({
			name,
			category: [tag(card.match(SECTOR)?.[1] ?? ''), said.tag, said.exited ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: site || page
		});
	}
	if (companies.length === 0) {
		throw new Error('canvas: no companies on the portfolio page');
	}

	return companies;
}
