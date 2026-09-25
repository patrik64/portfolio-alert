import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.exceptionalcap.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the companies' pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer, rendered on the server: every company is a card, drawn once per
// screen size, linking its page on the fund's site. the card writes the
// founders over the name, then figure and label in pairs — the year it was
// founded, the stage it is at, the stage the fund came in at, its sectors —
// and, on one the fund is out of, "Exit". the company's page adds a "View
// Website" link, so those pages are fetched for the sites; a page that will
// not load leaves its company linking to that page. the site's own search
// index lists every company page, so a list shorter than it is refused.

const CARD = /<a\b[^>]*\bdata-framer-name="List"[^>]*\bhref="\.\/portfolio\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
const TEXT = /<p\b[^>]*class="framer-text[^"]*"[^>]*>([\s\S]*?)<\/p>/g;
const WEBSITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*>\s*View Website/i;
const SEARCH_INDEX = /name="framer-search-index"\s+content="([^"]+)"/;
const LABELS = ['Founded', 'Stage', 'Invested', 'Sector'] as const;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Card {
	name: string;
	page: string;
	facts: Map<string, string>;
	exited: boolean;
}

// the site a company's page gives, or nothing when the page will not load
async function siteOf(page: string): Promise<string> {
	try {
		let resp = await fetch(page, { headers: { 'User-Agent': UA } });
		if (resp.status === 429) {
			await wait(20_000);
			resp = await fetch(page, { headers: { 'User-Agent': UA } });
		}
		if (!resp.ok) return '';
		return unescape((await resp.text()).match(WEBSITE)?.[1] ?? '');
	} catch {
		return '';
	}
}

// how many company pages the site's search index knows, or nothing when it
// cannot be read
async function indexed(html: string): Promise<number | undefined> {
	const url = html.match(SEARCH_INDEX)?.[1];
	if (!url) return undefined;
	try {
		const resp = await fetch(unescape(url), { headers: { 'User-Agent': UA } });
		if (!resp.ok) return undefined;
		const index = (await resp.json()) as Record<string, unknown>;
		return Object.keys(index).filter((path) => /^\/portfolio\/./.test(path)).length;
	} catch {
		return undefined;
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const cards = new Map<string, Card>();
	for (const [, slug, body] of html.matchAll(CARD)) {
		const texts = [...body.matchAll(TEXT)].map((m) => clean(m[1])).filter(Boolean);
		// the founders come first, the name second; each label names the
		// figure before it
		const name = texts[1] ?? '';
		if (!name || STEALTH.test(name)) continue;
		const facts = new Map<string, string>();
		texts.forEach((text, i) => {
			if ((LABELS as readonly string[]).includes(text) && i > 0) facts.set(text, texts[i - 1]);
		});
		// the badge says so, or the stage does ("Acquired")
		const exited = texts.some((t) => /^exit(ed)?$/i.test(t)) || /^(acquired|ipo)$/i.test(facts.get('Stage') ?? '');
		const known = cards.get(slug);
		if (known) known.exited ||= exited;
		else cards.set(slug, { name, page: `${PAGE_URL}/${slug}`, facts, exited });
	}
	if (cards.size === 0) {
		throw new Error('exceptional: no companies on the portfolio page');
	}
	const expected = await indexed(html);
	if (expected !== undefined && cards.size < expected) {
		throw new Error(`exceptional: the page shows ${cards.size} of the ${expected} companies the site indexes`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [i, card] of [...cards.values()].entries()) {
		if (seen.has(card.name.toLowerCase())) continue;
		seen.add(card.name.toLowerCase());
		if (i > 0) await wait(PACE_MS);
		const site = await siteOf(card.page);
		const founded = card.facts.get('Founded')?.match(/\b(?:19|20)\d{2}\b/)?.[0];
		const stage = card.facts.get('Stage') ?? '';
		const invested = card.facts.get('Invested') ?? '';
		companies.push({
			name: card.name,
			category: [
				...(card.facts.get('Sector') ?? '')
					.split(',')
					.map((t) => t.trim())
					.filter(Boolean),
				stage,
				invested ? `Invested ${invested}` : '',
				founded ? `Founded ${founded}` : '',
				card.exited ? 'Exited' : ''
			]
				.filter((t, k, all) => t && all.indexOf(t) === k)
				.join(', '),
			url: site || card.page
		});
	}

	return companies;
}
