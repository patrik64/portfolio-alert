import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.ecomachinesventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wix, drawn on the server: the page lists, first, the funds the firm is a
// limited partner of (Phystech Ventures, One Way Ventures), which are not
// companies and are left out, and then, under "Portfolio Companies", a block
// for each company — its name as a heading, then its hashtags ("#deeptech
// #chemistry"), a line about it and a "Website" link. the hashtags are kept as
// tags, without the mark, and "#EXITED" as the Exited tag.

const HEADING = /<h4\b[^>]*>(?:(?!<\/h4>)[\s\S])*Portfolio Companies(?:(?!<\/h4>)[\s\S])*<\/h4>/i;
const NAME = /(?=<h5\b)/;
const HEAD = /^<h5\b[^>]*>([\s\S]*?)<\/h5>/;
const PARAGRAPH = /<p\b[^>]*>([\s\S]*?)<\/p>/g;
const HASHTAG = /#([\p{L}\p{N}_-]+)/gu;
// a paragraph of hashtags and nothing else
const HASHTAGS = /^(?:#[\p{L}\p{N}_-]+\s*)+$/u;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const EXITED = /^exit(?:ed)?$/i;
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
	const heading = html.match(HEADING);
	if (heading?.index === undefined) {
		throw new Error('ecomachines: no "Portfolio Companies" heading — the markup moved');
	}
	const list = html.slice(heading.index + heading[0].length);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const block of list.split(NAME).slice(1)) {
		const name = clean(block.match(HEAD)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		// the hashtags, sometimes split over two paragraphs ("#EXITED" alone)
		const tags = [...block.matchAll(PARAGRAPH)]
			.map(([, p]) => clean(p))
			.filter((p) => HASHTAGS.test(p))
			.flatMap((p) => [...p.matchAll(HASHTAG)].map(([, t]) => t));
		const exited = tags.some((t) => EXITED.test(t));
		companies.push({
			name,
			category: [...tags.filter((t) => !EXITED.test(t)), exited ? 'Exited' : '']
				.filter((t, k, all) => t && all.indexOf(t) === k)
				.join(', '),
			url: unescape(block.match(SITE)?.[1] ?? '').trim() || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('ecomachines: no companies under "Portfolio Companies" — the markup moved');
	}

	return companies;
}
