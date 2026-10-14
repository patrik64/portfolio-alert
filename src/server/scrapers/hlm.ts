import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.hlmvp.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page is a grid of cards, the whole of it in the
// page, a card a company with its logo, opening a panel with its name, a few
// lines about it, its status ("Current" or "Past"), now and then the year it
// was founded, and a link to its site. a last card holds the fund's complete
// listing by registered name ("AbleTo, Inc."), a register of every company
// it has held, and is passed over: the cards are the portfolio the page
// shows. the year is kept as a tag, a past holding with the Exited tag.

const CARD = /<button class="postcards__card js-postcardsCardTrigger mix([^"]*)"[^>]*>([\s\S]*?)<\/button>/g;
// the panel's heading; the listing card's heading sits outside a panel's header
const NAME = /class="postcards__card__info__header"><div><h2>([\s\S]*?)<\/h2>/;
// "<h3>Status</h2><p>Past</p>" — the page closes its h3 with an h2
const FACT = (label: string) => new RegExp(`<h3>${label}</h[23]>\\s*<p>([^<]*)</p>`);
const SITE = /<a href="([^"]*)" target="_blank">/;
const LISTING = /\bpostcards__btnCustomPostcard\b/;
const YEAR = /\b(?:19|20)\d{2}\b/;
const PAST = /^past$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const [, classes, card] of html.matchAll(CARD)) {
		if (LISTING.test(classes)) continue;
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const founded = clean(card.match(FACT('Founded'))?.[1] ?? '').match(YEAR)?.[0];
		const past = PAST.test(clean(card.match(FACT('Status'))?.[1] ?? ''));
		const site = unescape(card.match(SITE)?.[1] ?? '').trim();
		if (/^https?:\/\//i.test(site)) withSite++;
		companies.push({
			name,
			category: [founded ? `Founded ${founded}` : '', past ? 'Exited' : ''].filter(Boolean).join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('hlm: no companies in the portfolio grid — the markup moved');
	}
	if (withSite === 0) {
		throw new Error("hlm: no card links its company's site — the cards' markup moved");
	}

	return companies;
}
