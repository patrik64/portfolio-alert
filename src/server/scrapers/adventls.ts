import type { ScrapedCompany } from './types';

const BASE_URL = 'https://adventls.com';
const PAGE_URL = `${BASE_URL}/portfolio/`;
// the page's grid asks this for the companies under one of its filters
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;
// the company pages are asked for one at a time, a pause between them; each
// takes about two seconds to come, so the deadline matters here
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with salient: the portfolio page is a grid of cards, the whole
// of it in the page, a card a company with its name, a line about it and a
// link to its page here, which gives its site. the grid's filters ("Exited
// Investments", "Private Companies", "Publicly Listed") are not written on
// the cards; the page asks the site for each filter's cards as it is
// clicked, and so does this, each filter's cards checked against the count
// the page gives it. a company can sit under two ("Acutus", exited and
// listed). an exit is kept with the Exited tag, a listing with the IPO
// tag. every filter must answer in full; a company page that will not
// load, or is not reached by the deadline, leaves its company linking it.

const CARD = /<a class="nectar-post-grid-link" href="([^"]*)"\s*>\s*<span class="screen-reader-text">([^<]*)<\/span>/g;
const FILTER = /<a href="#"(?: class="[^"]*")? data-filter="([^",]+)" data-total-count="(\d+)">([^<]*)</g;
// the company page's short lines, one of them its site: <div class="company-header"><h6 …><a href="…">
const HEADER = /<div class="company-header">\s*<h6\b[^>]*>([\s\S]*?)<\/h6>/g;
const HREF = /<a\b[^>]*\bhref="(https?:\/\/[^"]*)"/;
const EXITED = /^exited\b/i;
const LISTED = /^publicly listed$/i;
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// a page, or a refusal waited out once
async function get(url: string, init: RequestInit = {}): Promise<Response> {
	const request = () => fetch(url, { ...init, headers: { 'User-Agent': UA, ...init.headers } });
	const resp = await request();
	if (resp.status !== 429) return resp;
	await resp.body?.cancel();
	await wait(REFUSED_MS);
	return request();
}

// the cards' names, by the company page each links
const cardsOf = (html: string) =>
	new Map([...html.matchAll(CARD)].map(([, href, name]) => [unescape(href).trim(), clean(name)]));

// the cards under one filter, as the page asks for them
async function filtered(category: string): Promise<Map<string, string>> {
	const body = new URLSearchParams({
		action: 'nectar_get_post_grid_segment',
		post_type: 'portfolio',
		cpt_name: 'post',
		custom_query_tax: category,
		category,
		posts_per_page: '-1',
		current_page: '0',
		offset: '0',
		order: 'ASC',
		orderby: 'title',
		load_action: 'filter',
		'settings[post_type]': 'portfolio',
		'settings[pagination]': 'none',
		'settings[display_excerpt]': 'yes',
		'settings[heading_tag]': 'h4'
	});
	const resp = await get(AJAX_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body
	});
	if (!resp.ok) {
		throw new Error(`Failed to fetch the "${category}" filter of ${PAGE_URL}: ${resp.status}`);
	}
	return cardsOf(await resp.text());
}

// a company page's site, or nothing when it will not load
async function siteOf(href: string): Promise<string> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return '';
		}
		const html = await resp.text();
		for (const [, line] of html.matchAll(HEADER)) {
			const site = unescape(line.match(HREF)?.[1] ?? '').trim();
			if (site && !/^https?:\/\/(?:www\.)?adventls\.com\b/i.test(site)) return site;
		}
		return '';
	} catch {
		return '';
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();
	const resp = await get(PAGE_URL);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const cards = cardsOf(html);

	// each filter's label, by the name of every card under it — a company can
	// have a card under each filter, each linking a page of its own
	const labels = new Map<string, string[]>();
	for (const [, category, count, label] of html.matchAll(FILTER)) {
		await wait(PACE_MS);
		const under = await filtered(category);
		if (under.size !== Number(count)) {
			throw new Error(`adventls: the "${clean(label)}" filter gave ${under.size} of the ${count} it counts`);
		}
		for (const name of under.values()) {
			const key = name.toLowerCase();
			labels.set(key, [...(labels.get(key) ?? []), clean(label)]);
		}
	}
	if (labels.size === 0) {
		throw new Error("adventls: the portfolio page's filters moved — no company could be told held or exited");
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const [href, name] of cards) {
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const reached = /^https?:\/\//i.test(href) && Date.now() - started < DEADLINE_MS;
		if (reached) await wait(PACE_MS);
		const site = reached ? await siteOf(href) : '';
		if (site) withSite++;
		const under = labels.get(name.toLowerCase()) ?? [];
		companies.push({
			name,
			category: [
				under.some((label) => LISTED.test(label)) ? 'IPO' : '',
				under.some((label) => EXITED.test(label)) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || href || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('adventls: no companies in the portfolio grid — the markup moved');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("adventls: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
