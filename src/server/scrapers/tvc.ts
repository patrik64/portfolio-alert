import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://theventurecollective.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// astro, a static page: the portfolio is a grid of cards, the whole of it in
// the page, a card a company linking its site, with its name, a line about
// it, the sector the fund files it under ("Energy & AI Infrastructure",
// "Healthcare & Applied Bio") — the last few under none — and, on some, a
// badge: "Exit", the listing of one gone public ("NASDAQ: XE"), "Unicorn"
// or "Decacorn". the sector and the badge are kept as tags, an exit with
// the Exited tag and a listing with the IPO tag.
//
// the site relaunched in october 2026; the nuxt page before it wrote no
// names, and its companies were named by their picture files. the rows
// stored under those guesses were renamed to the fund's own spelling by
// hand when the page began to write it.

const CARD = /<a\b([^>]*\bclass="card big"[^>]*)>([\s\S]*?)<\/a>/g;
const HREF = /\bhref="([^"]*)"/;
const SECTOR = /\bdata-sector="([^"]*)"/;
const NAME = /class="card-name">([\s\S]*?)<\/div>/;
const BADGE = /class="tag">([\s\S]*?)<\/span>/;
const EXIT = /^exit(?:ed)?$/i;
// a ticker is a listing: "NASDAQ: XE"
const LISTED = /^(?:nasdaq|nyse|amex|lse|aim|euronext|tsx|asx)\b/i;
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

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const [, attrs, card] of html.matchAll(CARD)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const badge = clean(card.match(BADGE)?.[1] ?? '');
		const site = unescape(attrs.match(HREF)?.[1] ?? '').trim();
		if (/^https?:\/\//i.test(site)) withSite++;
		companies.push({
			name,
			category: [
				tag(attrs.match(SECTOR)?.[1] ?? ''),
				LISTED.test(badge) ? 'IPO' : EXIT.test(badge) ? 'Exited' : tag(badge)
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('tvc: no companies on the portfolio page — the markup moved');
	}
	if (withSite === 0) {
		throw new Error("tvc: no company links its site — the cards' markup moved");
	}

	return companies;
}
