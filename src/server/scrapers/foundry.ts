import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://foundry.vc/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a static page of its own, its attributes mostly unquoted: every card is a
// logo, named in the image's alt text, with a location and a bucket — an
// active company linking its site, a partner fund (the fund's stakes in
// other funds, which are not companies and are left out) or an exit, which
// links nowhere and says how it went ("Acquired by Alphabet"). the filters
// run in the browser, so the page holds every card.

const CARD = /<(a|div)\b([^>]*\bclass=(?:"card[^"]*"|card\b)[^>]*)>([\s\S]*?)<\/\1>/g;
const LOCATION = /<span class=(?:"loc"|loc)>([\s\S]*?)<\/span>/;
const OUTCOME = /<span class=(?:"exit-text"|exit-text)>([\s\S]*?)<\/span>/;
const STEALTH = /^stealth\b/i;

// an attribute's value, quoted or not
const attr = (tag: string, name: string) =>
	tag.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`))?.slice(1).find((v) => v !== undefined) ??
	'';

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a place written "Boulder, CO" would read
// as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, , opening, body] of html.matchAll(CARD)) {
		const bucket = attr(opening, 'data-bucket');
		if (bucket === 'fund') continue;
		const image = body.match(/<img\b[^>]*>/)?.[0] ?? '';
		const name = clean(attr(image, 'alt')) || clean(attr(opening, 'data-name'));
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const outcome = tag(body.match(OUTCOME)?.[1] ?? '');
		companies.push({
			name,
			category: [tag(body.match(LOCATION)?.[1] ?? ''), outcome, bucket === 'exit' || outcome ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: unescape(attr(opening, 'href')).trim() || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('foundry: no companies on the portfolio page');
	}

	return companies;
}
