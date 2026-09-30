import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.celesta.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page holds every company as a card — its name,
// the categories the filter reads ("AI/ML", "Life Sciences", and
// "Featured", which is for show and dropped) and its stage, "Active",
// "Exited", or "Exited" and "IPO" together — and the filter runs in the
// browser. a card links the company's page on the fund's site, where its
// own site is under "Links"; those pages are fetched one at a time, and a
// page that will not load leaves its company linking to it.

const CARD = /(?=<div\b[^>]*\bclass="collection-item-12 w-dyn-item")/;
const NAME = /\bfs-list-field="name"[^>]*>([\s\S]*?)<\/div>/;
const HEADING = /<h2\b[^>]*>([\s\S]*?)<\/h2>/;
const PAGE = /\bhref="(\/portfolio\/[^"]+)"/;
const CATEGORY = /\bfs-list-field="category"[^>]*>([\s\S]*?)<\/div>/g;
const STAGE = /\bfs-list-field="stage"[^>]*>([\s\S]*?)<\/div>/g;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="port-site\b/;
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
		const name = clean(card.match(NAME)?.[1] ?? '') || clean(card.match(HEADING)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		// the stage is a list, "Exited" and "IPO" for one that went public
		const stages = [...card.matchAll(STAGE)].map(([, stage]) => tag(stage));
		const exited = stages.some((s) => /^exit/i.test(s));
		const listed = stages.some((s) => /\bipo\b/i.test(s));
		const path = card.match(PAGE)?.[1];
		const page = path ? `${BASE_URL}${unescape(path)}` : PAGE_URL;
		if (path) await wait(PACE_MS);
		const site = path ? await siteOf(page) : '';
		companies.push({
			name,
			category: [
				...[...card.matchAll(CATEGORY)].map(([, category]) => tag(category)).filter((c) => !/^featured$/i.test(c)),
				listed ? 'IPO' : '',
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: site || page
		});
	}
	if (companies.length === 0) {
		throw new Error('celesta: no companies on the portfolio page');
	}

	return companies;
}
