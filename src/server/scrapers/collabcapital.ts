import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.collab.capital';
const PAGE_URL = `${BASE_URL}/portfolio`;
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page holds every company as a card — the themes
// it is filed under ("Community Infrastructure", "Healthcare Access",
// "Economic Mobility"), its name, its founders, where it is and the fund it
// came in with — and the filter runs in the browser. a company the fund is
// out of says so in its name, "Boxed Up (Acquired)"; the note is taken off
// the name and kept as the outcome. a card links the company's page on the
// fund's site, where its own site is the "Learn More" button; those pages
// are fetched one at a time, and a page that will not load leaves its
// company linking to it.

const CARD = /(?=<div\b[^>]*\bclass="cms_list-item\b)/;
const NAME = /class="company_name"[^>]*>([\s\S]*?)<\/div>/;
const THEME = /fs-list-field="make"[^>]*>([\s\S]*?)<\/div>/g;
const PLACE = /class="company_location"[^>]*>([\s\S]*?)<\/div>/;
const FUND = /fs-list-field="color"[^>]*>([\s\S]*?)<\/div>/;
const PAGE = /\bhref="(\/companies\/[^"]+)"/;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*>(?:(?!<\/a>)[\s\S])*?Learn More about/i;
const NOTE = /\s*\((acquired|ipo|merged)\)\s*$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a place written "Atlanta, GA" would read
// as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
			// a few are typed with a stray quote on the end
			const site = unescape((await resp.text()).match(SITE)?.[1] ?? '').replace(/^["'\s]+|["'\s]+$/g, '');
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
		const written = clean(card.match(NAME)?.[1] ?? '');
		const note = written.match(NOTE)?.[1] ?? '';
		const name = written.replace(NOTE, '').trim();
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const path = card.match(PAGE)?.[1];
		const page = path ? `${BASE_URL}${unescape(path)}` : PAGE_URL;
		if (path) await wait(PACE_MS);
		const site = path ? await siteOf(page) : '';
		companies.push({
			name,
			category: [
				...[...card.matchAll(THEME)].map(([, theme]) => tag(theme)),
				tag(card.match(PLACE)?.[1] ?? ''),
				tag(card.match(FUND)?.[1] ?? ''),
				/^ipo$/i.test(note) ? 'IPO' : note.charAt(0).toUpperCase() + note.slice(1).toLowerCase(),
				note ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: site || page
		});
	}
	if (companies.length === 0) {
		throw new Error('collabcapital: no companies on the portfolio page');
	}

	return companies;
}
