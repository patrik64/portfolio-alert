import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.blossomcap.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the profile pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page lays its companies out as cards in a few
// lists, each card with the company's area and sector ("Infrastructure /
// Developer Tools"), its country, the month the fund partnered with it, a
// note on its fundraising and a flag the page shows on one the fund has
// exited; an exit's note often names the buyer ("Acquired by Boundless in
// September 2025"). the cards name a company only in its logo's alt text,
// which is often empty, so each card's profile page is read for its
// heading. the fund links no company's site, so a company links its
// profile. a profile that will not load leaves its company named by its
// logo, or not at all.

const CARD = /(?=<div\b[^>]*role="listitem" class="[^"]*\bportfolio-card-wrap\b)/;
const PROFILE = /<a href="(\/portfolio\/[^"]+)" class="[^"]*\bportfolio-card-button\b/;
const LOGO_ALT = /class="portfolio-logo-wrap"><img\b[^>]*\balt="([^"]*)"/;
const AREA = /<p class="p2-caps">([\s\S]*?)<\/p>/;
const SPEC = /<li class="list-details">\s*<div class="portfolio-card-specs">([^<]*)<\/div>\s*<div class="portfolio-card-specs">([^<]*)<\/div>/g;
const NOTE = /follow-on-funding">[^<]*<\/div>\s*<div class="p1">([\s\S]*?)<\/div>/;
// the flag is in every card, hidden unless the company is an exit
const EXITED = /<div class="exited-flag(?! w-condition-invisible)"/;
const HEADING = /<h1[^>]*>([\s\S]*?)<\/h1>/;
const BUYER = /\bacquired by ([A-Z][^.,;()]*?)(?=\s+(?:in|for|to|and|as)\b|[.,;()]|$)/i;
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

// a profile's heading, or nothing when it will not load; a refusal is
// waited out once
async function headingOf(path: string): Promise<string> {
	try {
		let resp = await fetch(`${BASE_URL}${path}`, { headers: { 'User-Agent': UA } });
		if (resp.status === 429) {
			await resp.body?.cancel();
			await wait(REFUSED_MS);
			resp = await fetch(`${BASE_URL}${path}`, { headers: { 'User-Agent': UA } });
		}
		if (!resp.ok) return '';
		return clean((await resp.text()).match(HEADING)?.[1] ?? '');
	} catch {
		return '';
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const cards = html.split(CARD).slice(1);
	if (cards.length === 0) {
		throw new Error('blossom: no cards on the portfolio page');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	const profiles = new Set<string>();
	let named = 0;
	for (const [i, card] of cards.entries()) {
		const profile = card.match(PROFILE)?.[1] ?? '';
		// a company shown in two lists is one company
		if (!profile || profiles.has(profile)) continue;
		profiles.add(profile);
		if (i > 0) await wait(PACE_MS);
		const heading = await headingOf(profile);
		if (heading) named++;
		const name = heading || clean(card.match(LOGO_ALT)?.[1] ?? '').replace(/\s+logo$/i, '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const specs = new Map<string, string>();
		for (const [, label, value] of card.matchAll(SPEC)) {
			specs.set(clean(label).replace(/:$/, '').toLowerCase(), clean(value));
		}
		const year = specs.get('date of partnership')?.match(/\b(?:19|20)\d{2}\b/)?.[0];
		const out = EXITED.test(card);
		const buyer = out ? (clean(card.match(NOTE)?.[1] ?? '').match(BUYER)?.[1]?.trim() ?? '') : '';

		companies.push({
			name,
			category: [
				// "Infrastructure / Developer Tools": the area, then the sector
				...clean(card.match(AREA)?.[1] ?? '')
					.split(/\s*\/\s*/)
					.map(tag),
				tag(specs.get('country') ?? ''),
				year ? `Invested ${year}` : '',
				buyer ? `Acquired by ${tag(buyer)}` : '',
				out ? 'Exited' : ''
			]
				.filter((t, k, all) => t && all.indexOf(t) === k)
				.join(', '),
			url: `${BASE_URL}${profile}`
		});
	}

	if (companies.length === 0) {
		throw new Error('blossom: no companies on the portfolio page');
	}
	// without the profiles half the companies would go unnamed
	if (named === 0) {
		throw new Error("blossom: no profile page gave its company's name — the pages moved");
	}

	return companies;
}
