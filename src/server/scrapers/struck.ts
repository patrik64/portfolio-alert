import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://struckcapital.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress. the page prints its portfolio twice over, the same sixty-three
// cards in the same order one after the other, so the hundred and twenty-six
// on the page are sixty-three companies.
//
// each card names the company, links to it, and tags it. two of those tags say
// which arm of the fund is behind it: "Capital" where the fund invested, which
// is the ordinary case and says nothing, and "Studio" where the fund built the
// company itself, which does. the rest record how a company left — "Acquired:
// Coinbase", "NASDAQ: GRAB" — and are kept as the fund writes them, acquirer
// and ticker included.

const CARD = /<div\s+class="portfolio-item-card card/g;
const NAME = /<h3 class="accessible"[^>]*>([^<]*)<\/h3>/;
const SITE = /<a href="(https?:\/\/[^"]+)"[^>]*class="website-link"/;
const TAG = /<span class="category">([\s\S]*?)<\/span>/g;
// "Capital" is what every company the fund merely backed reads
const DEFAULT_TAG = /^capital$/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]+>/g, ''))
		.replace(/\s+/g, ' ')
		.trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const starts = [...html.matchAll(CARD)].map((m) => m.index);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (let i = 0; i < starts.length; i++) {
		const card = html.slice(starts[i], starts[i + 1] ?? html.length);
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: [...card.matchAll(TAG)]
				.map((m) => clean(m[1]))
				.filter((t) => t && !DEFAULT_TAG.test(t))
				.join(', '),
			url: card.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('struck: no companies on the portfolio page');
	}

	return companies;
}
