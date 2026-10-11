import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.henq.vc';
const PAGE_URL = `${BASE_URL}/#portfolio`;
// what a company's card opens, asked for the way the page's script asks
const DETAIL_URL = (slug: string) =>
	`${BASE_URL}//modules/portfolio/object-load.php?page=portfolio&portfolio=${encodeURIComponent(slug)}`;
// the company details are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a hand-built site: the home page's portfolio section shows every company
// as a card, its name in its logo's alt text, the flag of its country
// ("NL Flag") and an "EXIT" badge on the ones the fund is out of. a card
// opens a panel the page's script loads from the site, giving the city the
// company is based in, the year the fund invested, its site and a
// highlight, which for an exit names the buyer ("Sold to Siemens ($730M)").
// the country, the city and the year are kept as tags, an exit with the
// Exited tag and the buyer where the highlight names one. a panel that will
// not load leaves its company linking its card.

const SECTION = /\bid="portfolio"/;
const CARD = /(?=<div class="block portfolio\b)/;
const SLUG = /<a\b[^>]*\bhref="https?:\/\/(?:www\.)?henq\.vc\/portfolio\/([^/"?#]+)\/?"/;
const LOGO = /class="logo-list"\s*>\s*<img\b[^>]*\balt="([^"]*)"/;
const FLAG = /class="flag-list"\s*>([\s\S]*?)<\/div>/;
const FLAG_CODE = /\balt=['"]([a-z]{2})\s+flag['"]/gi;
const EXIT = /<span class="exit">\s*EXIT\s*<\/span>/i;
const ROW = /<div class="detail-label">([\s\S]*?)<\/div>\s*<div class="detail-value">([\s\S]*?)<\/div>/g;
const HREF = /<a\b[^>]*\bhref="([^"]*)"/;
// "Sold to Siemens ($730M)" -> "Siemens"
const SOLD = /^sold to\s+(.+?)(?:\s*\(.*\))?\s*$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

// "NL" -> "Netherlands"
const REGIONS = new Intl.DisplayNames(['en'], { type: 'region' });
const countryOf = (code: string) => {
	try {
		return REGIONS.of(code.toUpperCase()) ?? '';
	} catch {
		return '';
	}
};

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

interface Detail {
	city: string;
	year?: string;
	site: string;
	buyer?: string;
}

// what a company's panel says, or nothing when it will not load
async function detailOf(slug: string): Promise<Detail | null> {
	try {
		const resp = await get(DETAIL_URL(slug));
		if (!resp.ok) {
			await resp.body?.cancel();
			return null;
		}
		const html = await resp.text();
		const rows = new Map<string, string>(
			[...html.matchAll(ROW)].map(([, label, value]) => [clean(label).toLowerCase(), value])
		);
		const site = unescape(rows.get('website')?.match(HREF)?.[1] ?? '').trim();
		return {
			city: clean(rows.get('hq location') ?? ''),
			year: clean(rows.get('investment date') ?? '').match(/\b(?:19|20)\d{2}\b/)?.[0],
			site: /^https?:\/\//i.test(site) ? site : '',
			buyer: clean(rows.get('highlight') ?? '').match(SOLD)?.[1]
		};
	} catch {
		return null;
	}
}

interface Card {
	name: string;
	slug: string;
	countries: string[];
	exited: boolean;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	// the fragment is the browser's, so this asks for the home page
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// the portfolio section's cards, not the few the page's slider repeats
	const at = html.search(SECTION);
	const cards: Card[] = [];
	const seen = new Set<string>();
	for (const block of (at < 0 ? '' : html.slice(at)).split(CARD).slice(1)) {
		const slug = block.match(SLUG)?.[1];
		const name = clean(block.match(LOGO)?.[1] ?? '');
		if (!slug || !name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		cards.push({
			name,
			slug,
			countries: [...(block.match(FLAG)?.[1] ?? '').matchAll(FLAG_CODE)].map(([, code]) => countryOf(code)),
			exited: EXIT.test(block)
		});
	}
	if (cards.length === 0) {
		throw new Error("henq: no companies in the home page's portfolio section — the markup moved");
	}

	const companies: ScrapedCompany[] = [];
	let withSite = 0;
	for (const [i, card] of cards.entries()) {
		if (i > 0) await wait(PACE_MS);
		const detail = await detailOf(card.slug);
		if (detail?.site) withSite++;
		const out = card.exited || !!detail?.buyer;
		companies.push({
			name: card.name,
			category: [
				...card.countries.map(tag),
				tag(detail?.city ?? ''),
				detail?.year ? `Invested ${detail.year}` : '',
				detail?.buyer ? `Acquired by ${tag(detail.buyer)}` : '',
				out ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: detail?.site || `${BASE_URL}/portfolio/${card.slug}/`
		});
	}
	// without the panels every company would link its card
	if (withSite === 0) {
		throw new Error("henq: no company's panel gave its site — the panels' markup moved");
	}

	return companies;
}
