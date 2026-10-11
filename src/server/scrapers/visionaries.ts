import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://visionaries.vc/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// kirby: the home page's portfolio is a list of companies, a dozen shown
// at first and the rest behind a "show all" toggle, every one of them in the
// page. a company's entry gives its name, a line about it, a paragraph on
// it, a button to its site and the fund's thesis. the page sorts the
// companies into no sectors; a company the fund is out of says so only in
// its paragraph or the thesis ("arculus has been acquired by Jungheinrich
// AG"), naming the company itself — a founder's earlier sale does not count —
// and the buyer is then kept with the Exited tag.

const ITEM = /(?=<div\s+class="portfolio__item"[\s>])/;
const NAME = /class="portfolio__item-title-text"\s*>([\s\S]*?)<\/div>/;
const ABOUT = /class="portfolio__item-testimonial-content\b[^"]*"[^>]*>([\s\S]*?)<\/div>/;
const THESIS = /class="portfolio__item-text\b[^"]*"[^>]*>([\s\S]*?)<\/div>/;
const CTAS = /class="portfolio__item-ctas"\s*>([\s\S]*?)<\/div>/;
const HREF = /<a\b[^>]*\bhref="([^"]*)"/;
// "<name> has been acquired by X", the buyer up to the end of its name
const buyerOf = (name: string, text: string) =>
	text
		.match(
			new RegExp(
				`(?:^|[^\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(?:has been|was|got)\\s+acquired\\s+by\\s+([\\p{L}\\p{N}][^.,;()]*?)(?=\\s+(?:in|for|to|and|as|which|after)\\b|[.,;()]|$)`,
				'iu'
			)
		)?.[1]
		?.trim();
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
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const buyer = buyerOf(name, `${clean(item.match(ABOUT)?.[1] ?? '')} ${clean(item.match(THESIS)?.[1] ?? '')}`);
		const site = unescape((item.match(CTAS)?.[1] ?? '').match(HREF)?.[1] ?? '').trim();
		companies.push({
			name,
			category: buyer ? `Acquired by ${tag(buyer)}, Exited` : '',
			url: /^https?:\/\//i.test(site) ? site : `${PAGE_URL}#portfolio`
		});
	}

	if (companies.length === 0) {
		throw new Error('visionaries: no companies in the home page portfolio — the markup moved');
	}

	return companies;
}
