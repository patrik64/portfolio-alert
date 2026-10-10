import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.iqcapital.vc';
const PAGE_URL = `${BASE_URL}/companies`;
// the list's pages, were it to run past one, and the company pages are
// asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the companies page shows every company as a card, its name, a
// line about it, its sectors ("AI & Automation", "Health & Bio") and the
// stage the fund holds it at ("Seed", "Series B") or "Exited", an exit's
// card adding the way out beside the name ("(acq. Meta)", or a listing's
// ticker, "(AIMX: RDT)"). the sectors, the stage and the buyer are kept as
// tags. a company's own page links its site; a card links that page while
// the fund holds the company but not once it is out, when the page is
// found by the company's name the way webflow names it ("foundries-io").
// a company whose page names no site, as many an exit's does not, links its
// page, and one whose page will not load links the list.

const CARD = /(?=<div role="listitem" class="w-dyn-item"><div data-feed-exit=)/;
const STAGE = /^<div role="listitem" class="w-dyn-item"><div data-feed-exit="([^"]*)"/;
const NAME = /fs-cmssort-field="name" class="display-inlineflex[^"]*">([^<]*)</g;
const PROFILE = /<a href="(\/company\/[^"]+)" class="companies-feed_card-link\b/;
const SECTOR = /fs-cmsfilter-field="company-sector">([^<]*)</g;
const NEXT = /<a\b[^>]*\bhref="\?(\w+_page=\d+)"[^>]*\bclass="[^"]*\bw-pagination-next\b/;
const SITE = /<a href="(https?:\/\/[^"]+)" target="_blank" class="contact-content_scoail-link\b/;
const BUYER = /^\(\s*acq\.?\s+([^)]+?)\s*\)$/i;
const TICKER = /^\(\s*[A-Z]+\s*:\s*[A-Z.]+\s*\)$/;
const EXITED = /^exited$/i;
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

// "Foundries.io" -> "/company/foundries-io", the way webflow names its pages
const profileOf = (name: string) =>
	`/company/${name
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')}`;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// a page, or a refusal waited out once
async function get(url: string): Promise<Response> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (resp.status !== 429) return resp;
	await resp.body?.cancel();
	await wait(REFUSED_MS);
	return fetch(url, { headers: { 'User-Agent': UA } });
}

// a company's site, from its page; undefined when the page will not load
async function siteOf(profile: string): Promise<string | undefined> {
	try {
		const resp = await get(`${BASE_URL}${profile}`);
		if (!resp.ok) {
			await resp.body?.cancel();
			return undefined;
		}
		return unescape((await resp.text()).match(SITE)?.[1] ?? '').trim();
	} catch {
		return undefined;
	}
}

interface Card {
	name: string;
	profile: string;
	tags: string[];
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const cards: Card[] = [];
	const seen = new Set<string>();
	let url = PAGE_URL;
	for (let page = 1; page <= MAX_PAGES; page++) {
		const resp = await get(url);
		if (!resp.ok) {
			throw new Error(`iqcapital: page ${page} of the companies would not load (${resp.status})`);
		}
		const html = await resp.text();
		const found = html.split(CARD).slice(1);
		if (found.length === 0) {
			throw new Error(`iqcapital: no company cards on page ${page} — the markup moved`);
		}
		for (const card of found) {
			const [written, note] = [...card.matchAll(NAME)].map(([, part]) => clean(part));
			const name = written ?? '';
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const stage = clean(card.match(STAGE)?.[1] ?? '');
			const out = EXITED.test(stage) || BUYER.test(note ?? '') || TICKER.test(note ?? '');
			const buyer = (note ?? '').match(BUYER)?.[1];
			cards.push({
				name,
				profile: card.match(PROFILE)?.[1] ?? profileOf(name),
				tags: [
					...[...card.matchAll(SECTOR)].map(([, sector]) => tag(sector)),
					EXITED.test(stage) ? '' : tag(stage),
					buyer ? `Acquired by ${tag(buyer)}` : '',
					TICKER.test(note ?? '') ? 'IPO' : '',
					out ? 'Exited' : ''
				].filter((t, i, all) => t && all.indexOf(t) === i)
			});
		}
		const next = html.match(NEXT)?.[1];
		if (!next) break;
		url = `${PAGE_URL}?${next}`;
		await wait(PACE_MS);
	}

	if (cards.length === 0) {
		throw new Error('iqcapital: no companies on the companies page');
	}

	const companies: ScrapedCompany[] = [];
	let withSite = 0;
	for (const [i, card] of cards.entries()) {
		if (i > 0) await wait(PACE_MS);
		const site = await siteOf(card.profile);
		if (site) withSite++;
		companies.push({
			name: card.name,
			category: card.tags.join(', '),
			url: site || (site === undefined ? PAGE_URL : `${BASE_URL}${card.profile}`)
		});
	}
	// without the company pages every company would link the fund's site
	if (withSite === 0) {
		throw new Error("iqcapital: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
