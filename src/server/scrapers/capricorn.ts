import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://capricorn.be/en/portfolio-items';
// the pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// laravel with livewire: the portfolio page shows three logos a fund
// ("Capricorn Digital", "Capricorn Health", "Quest for Growth") and links
// each fund's own portfolio, which holds the whole of it, a card a company
// with its name, its sectors ("Digital Health", "Cleantech | Resource
// efficiency"), a line about it and, for one the fund is out of, an
// "exited" badge with its buyer's logo. a card opens its panel in the
// browser only, so no company's site is read and each links its fund's
// portfolio.
//
// quest for growth, the firm's listed fund, sorts its portfolio by kind
// ("Quoted Companies", "Venture Capital", "Venture Capital Funds") with a
// filter the page also answers as an address (?category=quoted-companies);
// a kind is kept as a tag, and the funds it holds are left out, being
// funds and not companies. a company in more than one fund is listed once
// with the tags of each. every fund's portfolio must load, and a filter
// that stops narrowing the list fails the run rather than mark it all.

// a fund's heading and the link to its portfolio, never reaching into the next fund's
const FUND = /<h2>\s*([^<]*?)\s*<\/h2>(?:(?!<h2>)[\s\S])*?<a\s+class="btn--text"\s+href="([^"]*\/portfolio\/filter)"/g;
const CARD = /(?=<div class="card card--default card--portfolio\b)/;
const NAME = /<h2 class="h5">([\s\S]*?)<\/h2>/;
const SECTORS = /<small class="d-block fw-bold mb-3">([\s\S]*?)<\/small>/;
const EXITED = /class="btn btn--acquired\b[\s\S]*?>\s*exited\b/i;
const KIND = /<input\b[^>]*\bname="category"[^>]*\bvalue="([^"]*)"[^>]*>\s*<label[^>]*>([\s\S]*?)<\/label>/g;
// the kind of a fund's holdings that are funds themselves
const FUNDS = /\bfunds?$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url: string): Promise<string> {
	await wait(PACE_MS);
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

const cardsOf = (html: string) => html.split(CARD).slice(1);
const nameOf = (card: string) => clean(card.match(NAME)?.[1] ?? '');

interface Entry {
	name: string;
	url: string;
	tags: string[];
	exited: boolean;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const funds = [...(await fetchText(PAGE_URL)).matchAll(FUND)].map(([, label, href]) => ({
		label: clean(label),
		url: unescape(href)
	}));
	if (funds.length === 0) {
		throw new Error("capricorn: the portfolio page links no fund's portfolio — the markup moved");
	}

	const entries = new Map<string, Entry>();
	for (const fund of funds) {
		const html = await fetchText(fund.url);
		const cards = cardsOf(html);
		// the kind each holding is filed under, by its name
		const kinds = new Map<string, string>();
		for (const [, value, label] of html.matchAll(KIND)) {
			const narrowed = cardsOf(await fetchText(`${fund.url}?category=${encodeURIComponent(unescape(value))}`));
			if (narrowed.length >= cards.length) {
				throw new Error(`capricorn: ${fund.label}'s "${clean(label)}" filter no longer narrows its portfolio`);
			}
			for (const card of narrowed) kinds.set(nameOf(card).toLowerCase(), clean(label));
		}

		for (const card of cards) {
			const name = nameOf(card);
			if (!name || STEALTH.test(name)) continue;
			const kind = kinds.get(name.toLowerCase()) ?? '';
			if (FUNDS.test(kind)) continue;
			const key = name.toLowerCase();
			const entry: Entry = entries.get(key) ?? { name, url: fund.url, tags: [], exited: false };
			entry.tags.push(
				fund.label,
				kind,
				...clean(card.match(SECTORS)?.[1] ?? '')
					.split('|')
					.map(tag)
			);
			entry.exited ||= EXITED.test(card);
			entries.set(key, entry);
		}
	}

	const companies: ScrapedCompany[] = [...entries.values()].map(({ name, url, tags, exited }) => ({
		name,
		category: [...tags, exited ? 'Exited' : '']
			.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
			.join(', '),
		url
	}));

	if (companies.length === 0) {
		throw new Error("capricorn: the funds' portfolios name no companies — the markup moved");
	}

	return companies;
}
