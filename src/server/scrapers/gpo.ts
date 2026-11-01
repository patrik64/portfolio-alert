import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.gpofund.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wix, its repeater served in the html: a card per company with its name, a line
// about it, its logo linking its site and a small badge beside the name. the badge
// says how it went, and only its image's file name does: "ipo2.png", "mnaicon.png",
// or a blank square on one still held. MapAnything, the one acquired, links its
// buyer's site, Salesforce, as the fund gives it.
const CARD = 'wixui-repeater__item"';
const FOOTER = 'id="SITE_FOOTER"';
const NAME = /<h2\b[^>]*>([\s\S]*?)<\/h2>/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const IPO_BADGE = /\balt="ipo[^"]*"/i;
const MNA_BADGE = /\balt="mna[^"]*"/i;

const clean = (s: string) =>
	s
		.replace(/<[^>]*>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#0?39;|&apos;|&rsquo;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	// the last card runs on to the end of the page, the fund's own links with it
	const cards = (await resp.text()).split(FOOTER)[0].split(CARD).slice(1);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of cards) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const ipo = IPO_BADGE.test(card);
		const mna = MNA_BADGE.test(card);
		companies.push({
			name,
			category: [ipo ? 'IPO' : '', mna ? 'M&A' : '', ipo || mna ? 'Exited' : ''].filter(Boolean).join(', '),
			url: card.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('gpo: no companies on the portfolio page');
	}

	return companies;
}
