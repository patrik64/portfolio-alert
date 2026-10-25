import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://shiftinvest.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a static page: the companies page is a grid of cards, the whole of it in
// the page, a card a company linking its site, named in its logo's alt
// text, with a line saying what it does ("Autonomous rail operations") and
// an "Exit" badge for one the fund is out of; each card is classed for the
// page's filter by the fund it sits in ("SHIFT III", "MIF I & II", "TTT
// CT"), which the filter names. the card keeps older markup commented out
// (a date, a badge) that the page does not show, and it is passed over.
// what the company does and its fund are kept as tags, an exit with the
// Exited tag.

const CARD = /(?=<div class="cell small-12 medium-6 large-3 company-container\b)/;
const CLASSES = /^<div class="cell small-12 medium-6 large-3 company-container([^"]*)"/;
const SITE = /<a class="company-item" href="([^"]*)"/;
// the logo, not the picture behind it
const NAME = /<div class="text">[\s\S]*?<img\b[^>]*\balt="([^"]*)"/;
const LINE = /<p class="subtitle">([\s\S]*?)<\/p>/;
const EXIT = /<div class="exit(?:-svg)?">\s*Exit\s*<\/div>/i;
const FILTER = /data-filter="\.(cat\d+)"[^>]*>([^<]*)</g;
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
	let resp: Response;
	try {
		resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	} catch (err) {
		// the cause behind node's bare "fetch failed": a connection that times
		// out or is refused, a name that no longer resolves
		const cause = (err as { cause?: { code?: string; message?: string } }).cause;
		const why = [cause?.code, cause?.message ?? (err instanceof Error ? err.message : String(err))]
			.filter(Boolean)
			.join(': ')
			.slice(0, 160);
		throw new Error(`shiftinvest: ${PAGE_URL} did not answer — ${why}`);
	}
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	// the funds, by the class each card is shown under
	const funds = new Map([...html.matchAll(FILTER)].map(([, cls, label]) => [cls, tag(label)]));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const raw of html.split(CARD).slice(1)) {
		const classes = raw.match(CLASSES)?.[1] ?? '';
		// what the page shows, without the markup it keeps commented out
		const card = raw.replace(/<!--[\s\S]*?-->/g, '');
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unescape(card.match(SITE)?.[1] ?? '').trim();
		if (/^https?:\/\//i.test(site)) withSite++;
		companies.push({
			name,
			category: [
				tag(card.match(LINE)?.[1] ?? ''),
				...classes
					.trim()
					.split(/\s+/)
					.map((cls) => funds.get(cls) ?? ''),
				EXIT.test(card) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('shiftinvest: no companies on the companies page — the markup moved');
	}
	if (withSite === 0) {
		throw new Error("shiftinvest: no company links its site — the cards' markup moved");
	}

	return companies;
}
