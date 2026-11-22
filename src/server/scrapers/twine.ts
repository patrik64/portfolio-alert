import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.twineventures.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, rebuilt on 2026-11-20: the portfolio is still a section of the
// front page, one card per company linking straight out to it, with its sector
// ("Healthcare", "Industrials", "Fintech / Data") and, for one the fund is out
// of, an "Acquired" tag. the page shows a dozen and its "view all" button
// unhides the rest, so the list is whole as served. the sector is kept as a
// tag, an acquired company with the Exited tag.
//
// two cards read "Stealth" and then a sector — investments the fund has not
// named — and link nowhere. a company genuinely called Stealth-something would
// have a link, so it is the pair that marks a placeholder, not the word.
//
// the old page marked an exit in the name ("Rupa Health (acq)"), and each of
// those is kept under the name it was stored as, so it is not taken for a new
// company.
const STORED_AS: Record<string, string> = {
	'covalent technologies': 'Covalent Technologies (acq)',
	'plover parametrics': 'Plover Parametrics (acq)',
	'rupa health': 'Rupa Health (acq)',
	'waltz health': 'Waltz Health (acq)'
};

const LIST = 'class="portfolio_list w-dyn-items"';
const CARD = /<a\b([^>]*\bclass="portfolio_item\b[^"]*"[^>]*)>([\s\S]*?)<\/a>/g;
const NAME = /class="portfolio_name"[^>]*>([\s\S]*?)<\/p>/;
const SECTOR = /class="portfolio_sector"[^>]*>([\s\S]*?)<\/p>/g;
const TAG = /class="portfolio_tag"[^>]*>([\s\S]*?)<\/p>/g;
const SITE = /\bhref="(https?:\/\/[^"]+)"/;
const ACQUIRED = /^acquired$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const at = html.indexOf(LIST);
	if (at < 0) {
		throw new Error('twine: no portfolio list on the page');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, attrs, card] of html.slice(at).matchAll(CARD)) {
		const written = clean(card.match(NAME)?.[1] ?? '');
		const name = STORED_AS[written.toLowerCase()] ?? written;
		const site = unescape(attrs.match(SITE)?.[1] ?? '').trim();
		if (!name || seen.has(name.toLowerCase()) || (!site && STEALTH.test(name))) continue;
		seen.add(name.toLowerCase());
		const tags = [...card.matchAll(TAG)].map(([, t]) => tag(t));
		companies.push({
			name,
			category: [
				...[...card.matchAll(SECTOR)].map(([, s]) => tag(s)),
				...tags.filter((t) => !ACQUIRED.test(t)),
				tags.some((t) => ACQUIRED.test(t)) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: site || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('twine: no companies in the portfolio list');
	}

	return companies;
}
