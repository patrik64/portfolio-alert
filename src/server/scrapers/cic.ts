import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.cic.vc/companies/';
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the companies page holds every company as a card — its name
// and a line about it — carrying as classes the filters it falls under:
// its sector ("Life Sciences", "Deep Tech") and its standing ("Current
// Companies", "Private", "Acquired", "IPO"), the filters spelling each
// out. an acquisition or a listing marks an exit. a card links the
// company's page on the fund's site, where its own site is the "Visit
// Website" link; those pages are fetched one at a time, and a page that
// will not load leaves its company linking to it.

const CARD = /(?=<div\b[^>]*\bclass="grid-item\b)/;
const CLASSES = /^<div\b[^>]*\bclass="([^"]*)"/;
const NAME = /<h4\b[^>]*>([\s\S]*?)<\/h4>/;
const PAGE = /<a\b[^>]*\bhref="(https?:\/\/[^"]*\/company\/[^"]*)"/;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*>(?:\s*<[^>]+>)*\s*Visit Website\s*</i;
// a filter: the class the companies carry, and how it is spelled out
const FILTER = /\bdata-filter="\.company_type-([\w-]+)"[^>]*>([\s\S]*?)<\/a>/g;
const SECTORS = new Set(['life-sciences', 'deep-tech']);
const EXITS = new Set(['acquired', 'ipo']);
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
	const labels = new Map([...html.matchAll(FILTER)].map(([, slug, label]) => [slug, tag(label)]));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const types = [...(card.match(CLASSES)?.[1] ?? '').matchAll(/\bcompany_type-([\w-]+)/g)].map(([, t]) => t);
		const exits = types.filter((t) => EXITS.has(t));
		const page = unescape(card.match(PAGE)?.[1] ?? '').trim();
		if (page) await wait(PACE_MS);
		const site = page ? await siteOf(page) : '';
		companies.push({
			name,
			category: [
				...types.filter((t) => SECTORS.has(t)).map((t) => labels.get(t) ?? ''),
				...exits.map((t) => labels.get(t) ?? ''),
				exits.length ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: site || page || PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('cic: no companies on the companies page');
	}

	return companies;
}
