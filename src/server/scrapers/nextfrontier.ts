import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://nextfrontiercapital.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer. every company is one link out to its own site, and framer names the
// parts of the card in the markup — "Name + Sector", "Sector List", "Title",
// "Chip Group" — so the fields are read by those names rather than by where
// they fall, which is what makes this safe against the fund adding a sector.
//
// the page is served twice over, once for each breakpoint, and only one of the
// two is ever shown; the second copy is dropped by name.
//
// the chips at the foot of a card say which of the fund's own vehicles holds
// the company and the year it came in. neither is anything about the company —
// a year is not a name to file one under — so the chip group is left alone.
//
// what sits over the logo instead is a badge for a company that has gone, and
// that is kept in the fund's own word for it: anything printed before the text
// wrapper is the badge, so if it ever says more than Exited, it will say so
// here too. eleven companies carry one, and seven of those now point at the
// company that bought them — Halp at atlassian.com, Ataata at mimecast.com.
// that is the address the fund publishes for them, so that is what they keep.
//
// two companies are filed under Other, which is the bucket for everything the
// four sectors miss and says nothing about either of them, so it is dropped
// the way the same bucket is dropped elsewhere. MeatEater is left with no
// category at all, which is the truth of what the page says about it.

const CARD = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
const HREF = /\bhref="(https?:\/\/[^"]+)"/;
const NEW_TAB = /\btarget="_blank"/;
// what framer calls each part of the card
// each part is read from the end of its own opening tag to the start of the
// next named one, so that half of a tag never lands in a field
const BADGE = /^([\s\S]*?)(?=<[^>]*data-framer-name="Text Wrapper")/;
const NAME = /data-framer-name="Name \+ Sector"[^>]*>([\s\S]*?)(?=<[^>]*data-framer-name=)/;
const SECTORS = /data-framer-name="Sector List"[^>]*>([\s\S]*?)(?=<[^>]*data-framer-name="Chip Group"|$)/;
const TITLE = /data-framer-name="Title"[^>]*>([\s\S]*?)(?=<[^>]*data-framer-name=|$)/g;
// the bucket for everything the four sectors miss
const BUCKET = /^other$/i;

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => un(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const body = html.slice(html.indexOf('<body'));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, attributes, card] of body.matchAll(CARD)) {
		const url = attributes.match(HREF)?.[1];
		// the fund's own linkedin and podcasts open in a new tab too, but they
		// are not cards and have no name of this shape
		if (!url || !NEW_TAB.test(attributes)) continue;

		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const sectors = [...(card.match(SECTORS)?.[1] ?? '').matchAll(TITLE)]
			.map((title) => clean(title[1]))
			.filter((sector) => sector && !BUCKET.test(sector));

		companies.push({
			name,
			category: [...sectors, clean(card.match(BADGE)?.[1] ?? '')].filter(Boolean).join(', '),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('nextfrontier: no companies in the portfolio grid');
	}

	return companies;
}
