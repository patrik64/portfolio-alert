import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.inventure.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page shows a few featured companies, a grid of the
// companies the fund holds and, under "Our Exited Companies", the names of
// those it is out of, with nothing more. a featured or grid company's card
// links its page here and gives its country and its sectors ("B2B SaaS",
// "Deep tech, New materials"); its page adds a link to its site and the
// round it last raised ("Series A in 2025", "€2m Seed in 2022") or who
// bought it ("Acquired by Doordash"). the sectors, the country and the
// round are kept as tags, an exit with the Exited tag and the buyer where
// the page names one. a company page that will not load leaves its company
// linking it; an exit without a card links the portfolio.

const CARD = /(?=<a\b[^>]*\bclass="hero-card_link\b)/;
const HREF = /^<a\b[^>]*\bhref="(\/venture\/[^"#?]+)"/;
const NAME = /class="hero-card_name\b[^"]*">([\s\S]*?)<\/div>/;
const COUNTRY = /class="card-info_line-1\b[^"]*">([\s\S]*?)<\/div>/;
const SECTORS = /class="card-info_line-2\b[^"]*">([\s\S]*?)<\/div>/;
const EXITS = /class="company-list_name\b[^"]*">([\s\S]*?)<\/div>/g;
// the company page's line under its name: its country, then its round
const ABOUT = /class="company-about"[\s\S]*?class="section-title"\s*>\s*<div\b[^>]*>((?:\s*<div>[\s\S]*?<\/div>)*)/;
const CELL = /<div>([\s\S]*?)<\/div>/g;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="company-info-link\b/;
const BUYER = /^acquired by\s+(.+)$/i;
// "€2m Seed in 2022" -> "Seed"
const AMOUNT = /^[€$£]?\s*\d[\d.,]*\s*(?:k|m|mn|bn)?\s+/i;
const WHEN = /\s+in\s+(?:19|20)\d{2}$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
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

interface Page {
	site: string;
	round: string;
}

// what a company's page says, or nothing when it will not load
async function pageOf(href: string): Promise<Page | null> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return null;
		}
		const html = await resp.text();
		const [, round = ''] = [...(html.match(ABOUT)?.[1] ?? '').matchAll(CELL)].map(([, cell]) => clean(cell));
		const site = unescape(html.match(SITE)?.[1] ?? '').trim();
		return { site: /^https?:\/\//i.test(site) ? site : '', round };
	} catch {
		return null;
	}
}

interface Card {
	name: string;
	profile: string;
	country: string;
	sectors: string[];
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// the featured and grid cards, each once (the featured ones are drawn
	// twice, for large screens and small, the small ones linking nowhere)
	const cards: Card[] = [];
	const seen = new Set<string>();
	for (const chunk of html.split(CARD).slice(1)) {
		const href = chunk.match(HREF)?.[1];
		const name = clean(chunk.match(NAME)?.[1] ?? '');
		if (!href || !name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		cards.push({
			name,
			profile: `${BASE_URL}${href}`,
			country: clean(chunk.match(COUNTRY)?.[1] ?? ''),
			sectors: clean(chunk.match(SECTORS)?.[1] ?? '').split(',')
		});
	}
	const exits = [...html.matchAll(EXITS)].map(([, name]) => clean(name)).filter((name) => name && !STEALTH.test(name));
	const exited = new Set(exits.map((name) => name.toLowerCase()));
	if (cards.length === 0) {
		throw new Error('inventure: no company cards on the portfolio page — the markup moved');
	}

	const companies: ScrapedCompany[] = [];
	let withSite = 0;
	for (const [i, card] of cards.entries()) {
		if (i > 0) await wait(PACE_MS);
		const page = await pageOf(card.profile);
		if (page?.site) withSite++;
		const buyer = page?.round.match(BUYER)?.[1];
		const round = buyer ? '' : (page?.round ?? '').replace(AMOUNT, '').replace(WHEN, '');
		const out = !!buyer || exited.has(card.name.toLowerCase());
		companies.push({
			name: card.name,
			category: [
				...card.sectors.map(tag),
				tag(card.country),
				tag(round),
				buyer ? `Acquired by ${tag(buyer)}` : '',
				out ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: page?.site || card.profile
		});
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("inventure: no company page gave its site — the pages' markup moved");
	}

	// the exits the page names without a card
	for (const name of exits) {
		if (seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: 'Exited', url: PAGE_URL });
	}

	return companies;
}
