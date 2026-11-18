import type { ScrapedCompany } from './types';

const BASE_URL = 'https://avpcap.com';
const PAGE_URL = `${BASE_URL}/companies/`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 8;
const BATCH_DELAY_MS = 300;

// wordpress, rebuilt on 2026-11-16 around a portfolio plugin of the site's own:
// the companies page is one grid of cards, each naming the company, filed for
// the page's filter under the fund's strategies ("venture", "growth",
// "european-defence") and opening a dialog the page fills from the plugin's
// endpoint, one company at a time by its id — its strategies as the filter
// writes them ("Venture"), its country, the year the fund came in and its
// site. those are kept as tags beside the strategy. the exits archive the old
// site kept (/project-type/exited) is gone, and nothing on the new one marks
// an exit. a company whose details do not load is kept on its card's word,
// linking its page here.

// the rebuild spelled a few names apart that the old site wrote as one word
// ("Modern Message" was "ModernMessage"), and each is kept under the name it
// was stored as, so it is not taken for a new company.
const STORED_AS: Record<string, string> = {
	'modern message': 'ModernMessage',
	'security scorecard': 'SecurityScorecard'
};

const CARD = /<a\b(?=[^>]*\bclass="avp-company-card")[^>]*>/g;
const ID = /\bdata-company-id="(\d+)"/;
const NAME = /\bdata-company-name="([^"]*)"/;
const PAGE = /\bdata-company-url="([^"]*)"/;
const STRATEGIES = /\bdata-strategies="([^"]*)"/;
const ENDPOINT = /\bdata-rest-url="([^"]*)"/;
const FILTER = /<button\b[^>]*\bclass="avp-company-filter\b[^"]*"[^>]*\bdata-filter="([^"]*)"[^>]*>([\s\S]*?)<\/button>/g;
const STEALTH = /^stealth\b/i;

interface Detail {
	name?: string;
	strategies?: string[];
	location?: string;
	investYear?: string | number;
	website?: string;
}

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function detailOf(endpoint: string, id: string): Promise<Detail | undefined> {
	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			const resp = await fetch(`${endpoint}${id}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
			if (resp.ok) return (await resp.json()) as Detail;
		} catch {
			// asked again below
		}
		if (attempt < 3) await sleep(1000 * attempt);
	}
	return undefined;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// the filter's words for the strategies' slugs: "european-defence" -> "European Defence"
	const labels = new Map<string, string>();
	for (const [, slug, label] of html.matchAll(FILTER)) labels.set(slug, tag(label));

	const cards: { id: string; name: string; page: string; strategies: string[] }[] = [];
	const seen = new Set<string>();
	for (const [card] of html.matchAll(CARD)) {
		const written = clean(card.match(NAME)?.[1] ?? '');
		const name = STORED_AS[written.toLowerCase()] ?? written;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		cards.push({
			id: card.match(ID)?.[1] ?? '',
			name,
			page: unescape(card.match(PAGE)?.[1] ?? '').trim(),
			strategies: (card.match(STRATEGIES)?.[1] ?? '')
				.split(/\s+/)
				.filter(Boolean)
				.map((slug) => labels.get(slug) ?? tag(slug.replace(/-/g, ' ')))
		});
	}
	if (cards.length === 0) {
		throw new Error('avp: no companies found in the portfolio grid');
	}

	const endpoint = unescape(html.match(ENDPOINT)?.[1] ?? '').trim();
	const details: (Detail | undefined)[] = [];
	if (endpoint) {
		for (let i = 0; i < cards.length; i += BATCH_SIZE) {
			if (i > 0) await sleep(BATCH_DELAY_MS);
			const batch = cards.slice(i, i + BATCH_SIZE);
			details.push(...(await Promise.all(batch.map(({ id }) => (id ? detailOf(endpoint, id) : undefined)))));
		}
	}

	return cards.map((card, i) => {
		const detail = details[i];
		const year = String(detail?.investYear ?? '').match(/\b(?:19|20)\d{2}\b/)?.[0];
		const website = (detail?.website ?? '').trim();
		return {
			name: card.name,
			category: [
				...(detail?.strategies?.length ? detail.strategies.map(tag) : card.strategies),
				tag(detail?.location ?? ''),
				year ? `Invested ${year}` : ''
			]
				.filter((t, j, all) => t && all.indexOf(t) === j)
				.join(', '),
			// the company's own site when the fund gives it, its page here otherwise
			url: /^https?:\/\//i.test(website) ? website : card.page || PAGE_URL
		};
	});
}
