import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.amfamventures.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the portfolio page is two lists, "Active"
// and "Notable Exits & Acquisitions", each company named, with a line
// about it, its category ("Core: Insurance", "Adjacent: Fintech"), kept as
// a tag, a link to its page on the fund's site and, for most, a link to
// its own site. a company under the exits is one the fund is out of, and
// its line says how ("Ring was acquired by Amazon in 2018"), the sale kept
// as "Acquired by Amazon" and a listing as "IPO". a company with no site
// of its own, or only its linkedin, links its page on the fund's site.

const SECTION = /(?=<div\b[^>]*\bclass="partner-type\b)/;
const LABEL = /^<div\b[^>]*>([\s\S]*?)<\/div>\s*<\/div>/;
const ITEM = /(?=<div\b[^>]*\bclass="list-item\b(?!-))/;
const NAME = /class="list-item-link"[^>]*>([\s\S]*?)<\/a>/;
const PAGE = /class="list-item-link"[^>]*\bhref="([^"]*)"|\bhref="([^"]*)"[^>]*class="list-item-link"/;
const DESC = /class="desc"[^>]*>([\s\S]*?)<\/div>/;
const CATEGORY = /class="category"[^>]*>([\s\S]*?)<\/div>/;
const ACTIONS = /class="actions\b[\s\S]*?<\/div>/;
const LINK = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
const HREF = /\bhref="([^"]*)"/;
const NOT_A_SITE = /amfamventures\.com|\/\/(?:[\w-]+\.)*(?:linkedin|twitter|x|facebook|instagram)\.com\b/i;
const EXITS = /\bexits?\b|\bacquisitions?\b/i;
// "was acquired by Healthmap solutions in 2025", "acquired by Wrench in June 2022"
const BUYER = /\bacquired by (.+?)(?=,|\s+(?:in|on)\b|\.(?:\s|$)|$)/i;
const LISTING = /\bIPO\b/;
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

// how the fund got out, as an exit's line says it
function outcome(line: string): string {
	const buyer = line.match(BUYER)?.[1];
	if (buyer) return `Acquired by ${tag(buyer)}`;
	return LISTING.test(line) ? 'IPO' : '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const section of html.split(SECTION).slice(1)) {
		const out = EXITS.test(clean(section.match(LABEL)?.[1] ?? ''));
		for (const item of section.split(ITEM).slice(1)) {
			const name = clean(item.match(NAME)?.[1] ?? '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const page = item.match(PAGE);
			const own = unescape(page?.[1] ?? page?.[2] ?? '').trim();
			let site = '';
			for (const [, attributes, label] of (item.match(ACTIONS)?.[0] ?? '').matchAll(LINK)) {
				const href = unescape(attributes.match(HREF)?.[1] ?? '').trim();
				if (/more details/i.test(clean(label)) || !/^https?:\/\//i.test(href) || NOT_A_SITE.test(href)) continue;
				site = href;
				break;
			}
			const went = out ? outcome(clean(item.match(DESC)?.[1] ?? '')) : '';
			companies.push({
				name,
				category: [tag(item.match(CATEGORY)?.[1] ?? ''), went, out ? 'Exited' : '']
					.filter((t, i, all) => t && all.indexOf(t) === i)
					.join(', '),
				url: site || (/^https?:\/\//i.test(own) ? own : PAGE_URL)
			});
		}
	}
	if (companies.length === 0) {
		throw new Error('amfam: no companies on the portfolio page');
	}

	return companies;
}
