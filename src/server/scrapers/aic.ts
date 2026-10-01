import type { ScrapedCompany } from './types';

const BASE_URL = 'https://aicapital.ai';
const PAGE_URL = `${BASE_URL}/our-companies/`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// nuxt, rendered on the server: the companies page is a run of cards, each
// naming the company over its fields ("Cloud infrastructure • Confidential
// Computing"), kept as tags, a link to its site on most and a paragraph
// about it. a company the fund is out of says so where the fields would be,
// "Acquired in 2022 by" or "Listed in" and then the buyer's or the
// exchange's logo, named only in its file ("Apple-logo.svg", "HKEX-logo.svg"),
// which is read as "Acquired by Apple" or "IPO (HKEX)"; those cards also give
// the years the company was founded and the fund came in, and the stage it
// came in at, kept as tags.

const CARD = /(?=<div\b[^>]*\bclass="startup-card\b)/;
const NAME = /class="startup-card__title"[^>]*>([\s\S]*?)<\/div>/;
const FIELDS = /class="startup-card__subtitle"[^>]*>\s*<div>([\s\S]*?)<\/div>\s*<\/div>/;
const SITE = /class="startup-card__link"[\s\S]*?<a\b[^>]*\bhref="([^"]*)"/;
const META = /class="meta-card__title"[^>]*>([\s\S]*?)<\/div>\s*<div class="meta-card__description"[^>]*>([\s\S]*?)<\/div>/g;
const LOGO = /<img\b[^>]*\bsrc="([^"]*)"/;
const BOLD = /<strong\b[^>]*>([\s\S]*?)<\/strong>/;
const ACQUIRED = /^acquired\b/i;
const LISTED = /^listed\b/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) =>
	unescape(s.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// "/images/startup-logos/NASDAQ-logo.svg" -> "NASDAQ", "BioNTech.png" -> "BioNTech"
const logoName = (src: string) =>
	decodeURIComponent(src.split(/[?#]/)[0].split('/').pop() ?? '')
		.replace(/\.\w+$/, '')
		.replace(/[-_ ]logo$/i, '')
		.replace(/[-_]+/g, ' ')
		.trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const fields = card.match(FIELDS)?.[1] ?? '';
		const said = clean(fields);
		// the buyer or the exchange, by its logo's file or written out
		const party = clean(fields.match(BOLD)?.[1] ?? '') || logoName(fields.match(LOGO)?.[1] ?? '');
		const known = party && !/^undisclosed$/i.test(party) ? party : '';
		const went = ACQUIRED.test(said)
			? known
				? `Acquired by ${tag(known)}`
				: 'Acquired'
			: LISTED.test(said)
				? known
					? `IPO (${tag(known)})`
					: 'IPO'
				: '';
		const meta = new Map([...card.matchAll(META)].map(([, label, value]) => [clean(label).toLowerCase(), clean(value)]));
		const year = (label: string) => meta.get(label)?.match(/\b(?:19|20)\d{2}\b/)?.[0];
		const founded = year('founded');
		const invested = year('invested');
		const site = unescape(card.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				...(went ? [] : said.split(/\s*•\s*/).map(tag)),
				founded ? `Founded ${founded}` : '',
				invested ? `Invested ${invested}` : '',
				tag(meta.get('stage') ?? ''),
				went,
				went ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('aic: no companies on the companies page');
	}

	return companies;
}
