import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://5amventures.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the portfolio page is a wall of logos
// that carry the company as data attributes — the name, the site, a line
// about it, the facts the panel lists ("Founded in 2002", "IPO in March
// 2014", "Acquired in December 2022", "Therapeutic Focus: Oncology",
// "4:59 Initiative", the fund's own programme) and the filter group it
// sits in, "acquired-ipos" or "active". a listing, a sale or a merger
// among the facts is how the fund got out, kept without its date; the
// therapeutic focus and the programme are kept as tags.

const ITEM = /<li\b[^>]*\bclass="company-click[^"]*"([^>]*)>/g;
const ATTR = (name: string) => new RegExp(`\\bdata-${name}=(?:"([^"]*)"|'([^']*)')`);
const FACT = /<li>([\s\S]*?)<\/li>/g;
const EXIT = /^(ipo|acquired|merged|merger)\b/i;
// "in March 2014", "in 2014", or a bare "2016"
const DATE = /\s+(?:in\s+)?(?:(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+)?(?:19|20)\d{2}\s*$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const attr = (attributes: string, name: string) => {
	const [, doubled, single] = attributes.match(ATTR(name)) ?? [];
	return doubled ?? single ?? '';
};

// "IPO in March 2014" -> "IPO", "Merger in 2014" -> "Merged"
const outcome = (fact: string) =>
	fact
		.replace(DATE, '')
		.replace(/^ipo\b/i, 'IPO')
		.replace(/^acquired\b/i, 'Acquired')
		.replace(/^merge[dr]\b/i, 'Merged');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, attributes] of html.matchAll(ITEM)) {
		const name = clean(attr(attributes, 'title'));
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const facts = [...unescape(attr(attributes, 'facts')).matchAll(FACT)].map(([, fact]) => clean(fact));
		const exits = facts.filter((f) => EXIT.test(f)).map(outcome);
		const exited = exits.length > 0 || /acquired|ipo/i.test(attr(attributes, 'groups'));
		const site = unescape(attr(attributes, 'website')).trim();
		companies.push({
			name,
			category: [
				...facts.filter((f) => /^therapeutic focus\s*:/i.test(f)).map((f) => tag(f.replace(/^therapeutic focus\s*:\s*/i, ''))),
				...facts.filter((f) => /^4:59 initiative$/i.test(f)),
				...exits,
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('5am: no companies on the portfolio page');
	}

	return companies;
}
