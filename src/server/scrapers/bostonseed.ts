import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://bostonseed.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the portfolio page is a wall of logos,
// each opening a panel served in the page — the founders, a piece "About
// Flywire" that names the company, its expertise ("B2B SaaS", "Consumer &
// Entertainment"), which the filters read too, and a link to its site. the
// piece opens, for the companies that have gone, on how: a listing's ticker
// on a line of its own ("NAS: DKNG") or a sentence — "Runkeeper was
// acquired by Asics (TKS: 7936) in 2016", "Parent company Streetwise Media
// was acquired by American City Business Journals in 2012" — read only when
// it is the company itself, or its parent, that was sold: one piece tells
// of a company the fund backed being bought by the company the panel is
// now named for, and that is not an exit of the company named.

const ITEM = /(?=<div\b[^>]*\bclass="[^"]*\bmix-items\b)/;
const NAME = /<h6\b[^>]*\bclass="title"[^>]*>\s*About\s+([\s\S]*?)<\/h6>/;
const EXPERTISE = /class="expertises"[^>]*>([\s\S]*?)<\/span>/;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="website"/;
const PIECE = /class="content__editor"[^>]*>([\s\S]*?)<\/div>/;
const PARAGRAPH = /<p\b[^>]*>([\s\S]*?)<\/p>/g;
const LISTING = /^(NAS|NASDAQ|NYSE|TKS|TSX|LSE)\s*:\s*([A-Z0-9.]+)\s*$/;
const SOLD = /^(.+?)\s+was\s+(?:acquired\s+by|s\s?old\s+to)\s+(.+)$/i;
// where the buyer's name ends: a date, a ticker, an aside, the sentence
const BUYER_END = /\s*(?:,|\(|\.(?:\s|$)|\bin\s+(?:19|20)\d{2}\b|\ba\s+subsidiary\b|\bnow\b)[\s\S]*$/i;
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

// how the company went, if the piece says so
function outcome(name: string, paragraphs: string[]): string {
	for (const paragraph of paragraphs) {
		const listed = paragraph.match(LISTING);
		if (listed) return `IPO (${listed[1]}: ${listed[2]})`;
		const sold = paragraph.match(SOLD);
		if (!sold) continue;
		const subject = sold[1].toLowerCase();
		if (subject === name.toLowerCase() || subject.startsWith('parent company')) {
			return `Acquired by ${sold[2].replace(BUYER_END, '').trim()}`;
		}
	}
	return '';
}

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
		const paragraphs = [...(item.match(PIECE)?.[1] ?? '').matchAll(PARAGRAPH)].map(([, p]) => clean(p));
		const went = outcome(name, paragraphs);
		const site = unescape(item.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				// the expertise is typed with stray commas (", B2B SaaS")
				...clean(item.match(EXPERTISE)?.[1] ?? '')
					.split(',')
					.map((label) => tag(label)),
				went,
				went ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('bostonseed: no companies on the portfolio page');
	}

	return companies;
}
