import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.daphni.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the list's pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const MAX_PAGES = 50;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page lists two dozen companies at a time, with a
// link to the next two dozen ("?5858938c_page=2", the parameter read from
// the link each run). a company's card carries what the page filters by:
// its name, its sectors ("AI", "E-commerce"), the fund it was backed from
// (named by a colour, "Yellow", "Purple", which is not kept), its state,
// "active" or "exit", and the year the fund invested — and its site, linked,
// or kept behind a link to its page here; a few give neither, and link that
// page or the list. the sectors and the year are kept as tags, an exit with
// the Exited tag. a page of the list that will not load fails the run, as
// the list would be short.

const CARD = /(?=<div role="listitem" class="portfolio-list_item w-dyn-item">)/;
const FIELD = (name: string) =>
	new RegExp(`fs-list-field="${name}"[^>]*>([\\s\\S]*?)<\\/(?:div|p|span|a|h[1-6])>`, 'g');
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="portfolio-card_link-site\b/;
const PROFILE = /<a\b[^>]*\bhref="(\/portfolio\/[^"#?]+)"[^>]*\bclass="portfolio-card_link-page\b/;
const NEXT = /<a\b[^>]*\bhref="\?(\w+_page=\d+)"[^>]*\bclass="[^"]*\bw-pagination-next\b/;
const EXITED = /^exit(?:ed)?$/i;
const UNSAID = /^(?:-|other|others|all|n\/a|active)$/i;
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
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (resp.status !== 429) return resp;
	await resp.body?.cancel();
	await wait(REFUSED_MS);
	return fetch(url, { headers: { 'User-Agent': UA } });
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let url = PAGE_URL;
	for (let page = 1; page <= MAX_PAGES; page++) {
		const resp = await get(url);
		if (!resp.ok) {
			throw new Error(`daphni: page ${page} of the portfolio would not load (${resp.status})`);
		}
		const html = await resp.text();
		const cards = html.split(CARD).slice(1);
		if (cards.length === 0) {
			throw new Error(`daphni: no companies on page ${page} of the portfolio — the markup moved`);
		}
		for (const card of cards) {
			const field = (name: string) => [...card.matchAll(FIELD(name))].map(([, value]) => clean(value)).filter(Boolean);
			const name = field('name')[0] ?? '';
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const state = field('state')[0] ?? '';
			const year = field('date')[0]?.match(/\b(?:19|20)\d{2}\b/)?.[0];
			const site = unescape(card.match(SITE)?.[1] ?? '').trim();
			const profile = card.match(PROFILE)?.[1];
			companies.push({
				name,
				category: [...field('sector').map(tag), year ? `Invested ${year}` : '', EXITED.test(state) ? 'Exited' : '']
					.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
					.join(', '),
				url: /^https?:\/\//i.test(site) ? site : profile ? `${BASE_URL}${profile}` : PAGE_URL
			});
		}
		const next = html.match(NEXT)?.[1];
		if (!next) break;
		url = `${PAGE_URL}?${next}`;
		await wait(PACE_MS);
	}

	if (companies.length === 0) {
		throw new Error('daphni: no companies on the portfolio page');
	}

	return companies;
}
