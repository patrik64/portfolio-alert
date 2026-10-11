import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.kiboventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page lists every company as a logo linking its
// site, filtered in the browser by the fund it was backed from ("Kibo
// Ventures", "Kibo Nzyme") and by how it stands — "Live", "Exit" or "We
// tried". a card keeps its name, its fund and the date the fund invested
// in hidden fields for the filters, and shows a badge on a company the
// fund is out of: "Acquired by Groupon", "Acquired", "Nasdaq IPO" or "We
// tried", the card's other badges hidden. the fund and the year are kept
// as tags; a badge's buyer as "Acquired by …", any other way out as
// written, each with the Exited tag, and "We tried" with the Closed tag.

const CARD = /(?=<div role="listitem" class="porfolio-item is-page w-dyn-item">)/;
const FIELD = (name: string) => new RegExp(`porfolio="${name}"[^>]*>([\\s\\S]*?)<\\/div>`);
// a badge the card shows, and the parts of it the card does not hide
const BADGE = /<div\b[^>]*\bclass="acquired-tag"[^>]*>([\s\S]*?)<\/div><\/div><\/div>/g;
const SHOWN = /<div class="w-embed">\s*<div class="text-s">([^<]*)/g;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="link\b/;
// "Acquired by Groupon" -> "Groupon", the words said twice once
const BUYER = /^(?:acquired by\s+)+(.+)$/i;
const ACQUIRED = /^acquired$/i;
const TRIED = /^we tried$/i;
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

// what a badge says: the way out, as a tag or two
function wayOut(badge: string): string[] {
	const buyer = badge.match(BUYER)?.[1];
	if (buyer) return [`Acquired by ${tag(buyer)}`, 'Exited'];
	if (ACQUIRED.test(badge)) return ['Exited'];
	if (TRIED.test(badge)) return ['Closed'];
	return [tag(badge), 'Exited'];
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
		const field = (name: string) => clean(card.match(FIELD(name))?.[1] ?? '');
		const name = field('dataname');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const badges = [...card.matchAll(BADGE)]
			.map(([, badge]) => [...badge.matchAll(SHOWN)].map(([, text]) => clean(text)).join(' '))
			.map(clean)
			.filter(Boolean);
		const year = field('date').match(/\b(?:19|20)\d{2}\b/)?.[0];
		const site = unescape(card.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [tag(field('dataproject')), year ? `Invested ${year}` : '', ...badges.flatMap(wayOut)]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('kibo: no companies on the portfolio page — the markup moved');
	}

	return companies;
}
