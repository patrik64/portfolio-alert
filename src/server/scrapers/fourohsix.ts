import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.406ventures.com/companies/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the companies page is a grid of cards, the whole of it in the
// page, a card a company with its name, its sectors ("Healthcare", "Data +
// AI", "Cybersecurity"), a line about it, a link to its site and, for one
// the fund is out of, an "Exited" mark, the line then ending on how
// ("… Acquired by Optum.", "… IPO."). the sectors are kept as tags, an exit
// with the Exited tag and its buyer or listing. a company the fund is out
// of links its case study here where it has one. a name's note of an older
// one ("RoonCyber.AI (FKA ThreatX)") is not part of it.

const CARD = /(?=<div\s+class="company-card"\s)/;
const NAME = /<h2 class="company-name">([\s\S]*?)<\/h2>/;
const FORMERLY = /\s*\((?:formerly|fka|f\.k\.a\.?)\s[^)]*\)\s*/i;
const STATUS = /\bdata-company-status="([^"]*)"/;
const SECTOR = /<li class="[^"]*\bsector-[^"]*">([\s\S]*?)<\/li>/g;
const LINE = /<p class="company-description">([\s\S]*?)<\/p>/;
const SITE = /<a href="([^"]*)" class="company-website\b/;
const STUDY = /<a href="([^"]*)" class="[^"]*">\s*Learn More\s*<\/a>/;
// how a company the fund is out of went, as its line ends: "Acquired by Optum.", "IPO."
const BUYER = /\bacquired by\s+([^.]+?)\.?\s*$/i;
const IPO = /\bIPO\.?\s*$/;
const EXITED = /^exited$/i;
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
	for (const card of html.split(CARD).slice(1)) {
		const name = clean(card.match(NAME)?.[1] ?? '').replace(FORMERLY, ' ').trim();
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const exited = EXITED.test(card.match(STATUS)?.[1] ?? '');
		const line = clean(card.match(LINE)?.[1] ?? '');
		const buyer = exited ? clean(line.match(BUYER)?.[1] ?? '') : '';
		const site = unescape(card.match(SITE)?.[1] ?? '').trim();
		const study = unescape(card.match(STUDY)?.[1] ?? '').trim();
		if (/^https?:\/\//i.test(site)) withSite++;
		companies.push({
			name,
			category: [
				...[...card.matchAll(SECTOR)].map(([, sector]) => tag(sector)),
				buyer ? `Acquired by ${tag(buyer)}` : exited && IPO.test(line) ? 'IPO' : '',
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: [site, study].find((href) => /^https?:\/\//i.test(href)) ?? PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('406: no companies on the companies page — the markup moved');
	}
	if (withSite === 0) {
		throw new Error("406: no company links its site — the cards' markup moved");
	}

	return companies;
}
