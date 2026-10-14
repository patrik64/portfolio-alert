import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.nvfund.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the fund's exits, each kind on a page of its own
const EXIT_URLS = [`${BASE_URL}/exits-successes/ipo`, `${BASE_URL}/exits-successes/mergers-acquisitions`];
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// drupal: the portfolio page is a grid of cards, the fund's current
// companies, the whole of them in the page, a card a company named in its
// heading and linking its page here, which gives its kind ("Platform"),
// where it is ("Cambridge, UK") and its site. the fund's exits are listed
// on two pages of their own, a name and a line each — the listings ("…
// completed its initial public offering (NASDAQ: ACOR) in 2006") and the
// sales ("… was acquired by Medtronic, Inc. in 2009"). a name is written
// with its legal form as often as not ("Artios Pharma Limited", "Vivet
// Therapeutics SAS"); the form is not part of it. the kind and the place
// are kept as tags, a listing with the IPO tag, a sale with its buyer, and
// either with the Exited tag. both exit pages must load; a company page
// that will not load, or is not reached by the deadline, leaves its company
// linking it.

const CARD = /<a\b[^>]*\bcontent-block-hover"[^>]*\btitle="([^"]*)"[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
const HEADING = /<h3 class='h3'>([\s\S]*?)<\/h3>/;
const EXIT = /<h5 class="brand-primary-text-color">([\s\S]*?)<\/h5>\s*<p\b[^>]*>([\s\S]*?)<\/p>/g;
// the company page's kind and place: <p …>Platform&nbsp;<br>Cambridge, UK</p>
const FACTS = /<div id="Portfolio_p"[\s\S]*?<p\b[^>]*>([\s\S]*?)<\/p>/;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*>\s*Visit\b/;
const LISTED = /\b(?:public offering|publicly listed|went public)\b/i;
// "was acquired by Medtronic, Inc. in 2009", "and was acquired by Lilly in 2022"
const BUYER = /\bacquired by\s+(.+?)(?:\s+in\s+(?:19|20)\d{2}\b.*|\.\s*$|$)/i;
const FORM = /[\s,]+(?:inc\.?|llc|ltd\.?|limited|corp\.?|ag|gmbh|sas|sa|bv|plc)$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]+>/g, ' '))
		.replace(/[\s ]+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// "Vivet Therapeutics SAS" -> "Vivet Therapeutics", "Altimmune, Inc." -> "Altimmune"
const bare = (s: string) => {
	let name = clean(s);
	for (let before = ''; before !== name; ) {
		before = name;
		name = name.replace(FORM, '').trim();
	}
	return name || clean(s);
};

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

async function pageText(url: string): Promise<string> {
	const resp = await get(url);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

// a company page's kind, place and site, or nothing when it will not load
async function detailsOf(href: string): Promise<{ facts: string[]; site: string }> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return { facts: [], site: '' };
		}
		const html = await resp.text();
		const facts = (html.match(FACTS)?.[1] ?? '').split(/<br\s*\/?>/i).map(clean);
		const site = unescape(html.match(SITE)?.[1] ?? '').trim();
		return { facts, site: /^https?:\/\//i.test(site) ? site : '' };
	} catch {
		return { facts: [], site: '' };
	}
}

interface Entry {
	name: string;
	url: string;
	tags: string[];
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();
	const html = await pageText(PAGE_URL);

	const entries = new Map<string, Entry>();
	let withSite = 0;
	for (const [, title, path, card] of html.matchAll(CARD)) {
		const name = bare(card.match(HEADING)?.[1] ?? title);
		if (!name || STEALTH.test(name) || entries.has(name.toLowerCase())) continue;
		const href = new URL(unescape(path), BASE_URL).href;
		const reached = Date.now() - started < DEADLINE_MS;
		if (reached && entries.size > 0) await wait(PACE_MS);
		const { facts, site } = reached ? await detailsOf(href) : { facts: [], site: '' };
		if (site) withSite++;
		// the kind on the first line, the place on the second
		const [kind = '', place = ''] = facts;
		entries.set(name.toLowerCase(), {
			name,
			url: site || href,
			tags: [...kind.split(','), ...place.split(',')].map(tag)
		});
	}
	if (entries.size === 0) {
		throw new Error('novartisvf: no companies in the portfolio grid — the markup moved');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("novartisvf: no company page gave its site — the pages' markup moved");
	}

	// the exits, from their own pages; a company still held keeps its own entry and gains the tags
	for (const url of EXIT_URLS) {
		await wait(PACE_MS);
		const page = await pageText(url);
		const exits = [...page.matchAll(EXIT)];
		if (exits.length === 0) {
			throw new Error(`novartisvf: ${url} lists no exits — the markup moved`);
		}
		for (const [, heading, line] of exits) {
			const name = bare(heading);
			if (!name || STEALTH.test(name)) continue;
			const text = clean(line);
			// "EntreMed, Inc. (now CASI Pharmaceuticals, Inc.)" -> "EntreMed"; a company buying back the
			// fund's stake ("NVF's holdings in Genedata were acquired by Genedata") is no buyer
			const bought = bare((text.match(BUYER)?.[1] ?? '').replace(/\s*\([^()]*\)/g, ''));
			const buyer = bought.toLowerCase() === name.toLowerCase() ? '' : bought;
			const entry = entries.get(name.toLowerCase()) ?? { name, url, tags: [] };
			entry.tags.push(LISTED.test(text) ? 'IPO' : '', buyer ? `Acquired by ${tag(buyer)}` : '', 'Exited');
			entries.set(name.toLowerCase(), entry);
		}
	}

	return [...entries.values()].map(({ name, url, tags }) => ({
		name,
		category: tags.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i).join(', '),
		url
	}));
}
