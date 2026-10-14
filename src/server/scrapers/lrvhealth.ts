import type { ScrapedCompany } from './types';

const BASE_URL = 'https://lrvhealth.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page is three tabs of cards, "All Companies",
// "Active" and "Alumni", the whole of each in the page, a card a company
// with its name and, for an alumnus, how the fund came out of it
// ("Acquired by Health Catalyst", "IPO: NYSE PHR"), linking its page here,
// which gives its site. the companies are read from the "All" tab, and a
// company the "Alumni" tab holds is an exit, kept with the Exited tag and
// its buyer or listing. a company page that will not load, or is not
// reached by the deadline, leaves its company linking it.

const TAB = /(?=<div data-w-tab="[^"]*" class="portfolio_tab-pane\b)/;
const TAB_NAME = /^<div data-w-tab="([^"]*)"/;
const CARD = /<a aria-label="[^"]*" href="([^"]*)" class="portfolio_card\b[\s\S]*?<\/a>/g;
const NAME = /<h2 class="heading-style-h3">([\s\S]*?)<\/h2>/;
const NOTE = /<p class="text-size-medium">([\s\S]*?)<\/p>/;
const SITE = /<h2 class="text-style-eyebrow">website<\/h2><\/div><a\b[^>]*\bhref="([^"]*)"/i;
const BUYER = /^acquired by\s+(.+?)\.?$/i;
const IPO = /^ipo\b/i;
// a buyer's legal form: "Blue Circle Health, Inc."
const FORM = /,?\s+(?:inc|llc|ltd|corp)\.?$/i;
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

// a page, or a refusal waited out once
async function get(url: string): Promise<Response> {
	const headers = { 'User-Agent': UA };
	const resp = await fetch(url, { headers });
	if (resp.status !== 429) return resp;
	await resp.body?.cancel();
	await wait(REFUSED_MS);
	return fetch(url, { headers });
}

// a company page's site, or nothing when it will not load
async function siteOf(href: string): Promise<string> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return '';
		}
		const site = unescape((await resp.text()).match(SITE)?.[1] ?? '').trim();
		return /^https?:\/\//i.test(site) ? site : '';
	} catch {
		return '';
	}
}

// how a company the fund is out of went, as a tag: "Acquired by Health Catalyst", "IPO"
function wentTo(note: string): string {
	const buyer = note.match(BUYER)?.[1];
	if (buyer) return `Acquired by ${tag(clean(buyer).replace(FORM, ''))}`;
	return IPO.test(note) ? 'IPO' : '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();
	const resp = await get(PAGE_URL);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	// each tab's cards; the page carries the tabs once a breakpoint, the first of each read
	const tabs = new Map<string, string>();
	for (const pane of html.split(TAB).slice(1)) {
		const tab = pane.match(TAB_NAME)?.[1] ?? '';
		if (tab && !tabs.has(tab)) tabs.set(tab, pane);
	}
	const all = tabs.get('All');
	if (!all) {
		throw new Error('lrvhealth: the portfolio page has no "All Companies" tab — the markup moved');
	}
	const alumni = new Set(
		[...(tabs.get('Alumni') ?? '').matchAll(CARD)].map(([card]) => clean(card.match(NAME)?.[1] ?? '').toLowerCase())
	);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const [card, path] of all.matchAll(CARD)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const href = new URL(unescape(path), BASE_URL).href;
		const reached = Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const site = reached ? await siteOf(href) : '';
		if (site) withSite++;
		const note = clean(card.match(NOTE)?.[1] ?? '');
		const exited = alumni.has(name.toLowerCase());
		companies.push({
			name,
			category: [exited ? wentTo(note) : '', exited ? 'Exited' : '']
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || href
		});
	}

	if (companies.length === 0) {
		throw new Error('lrvhealth: no companies in the portfolio tabs — the markup moved');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("lrvhealth: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
