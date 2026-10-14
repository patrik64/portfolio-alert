import type { ScrapedCompany } from './types';

const BASE_URL = 'https://trind.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page is a grid of cards a fund ("FUND 2", "FUND
// 1"), the whole of each in the page, a card a company linking its page
// here, with its name, its sector ("MusicTech", "Circular economy"), a line
// about it and its status ("Active" or "EXITED"). a company's page adds the
// year the fund invested ("Funded IN"), the country it is based in ("Home
// Base") and its site. the fund, the sector, the country and the year are
// kept as tags, an exit with the Exited tag. a company page that will not
// load, or is not reached by the deadline, leaves its company linking it.

const LIST = /(?=<div\b[^>]*class="list-fund\d+ w-dyn-list")/;
const FUND = /^<div\b[^>]*class="list-fund(\d+) w-dyn-list"/;
const CARD = /<a href="(\/portfolio\/[^"]*)" class="company-card\b[^"]*">([\s\S]*?)<\/a>/g;
const NAME = /class="heading-4-center">([\s\S]*?)<\/div>/;
const SECTOR = /class="quote-small-center is-monospace">([\s\S]*?)<\/div>/;
// the exit pill, shown unless the condition hides it
const EXITED = /<div class="w-layout-hflex"><div class="w-layout-hflex status-pill-item-exit">/;
const FACT = (label: string) =>
	new RegExp(`<h5 class="headline">${label}</h5>\\s*<div class="body-14">([^<]*)</div>`, 'i');
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*class="button-small-icon w-button">\s*WEBSITE\s*</i;
const YEAR = /\b(?:19|20)\d{2}\b/;
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

interface Details {
	site: string;
	year?: string;
	country: string;
}

// a company page's site, year and country, or nothing when it will not load
async function detailsOf(href: string): Promise<Details> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return { site: '', country: '' };
		}
		const html = await resp.text();
		const site = unescape(html.match(SITE)?.[1] ?? '').trim();
		return {
			site: /^https?:\/\//i.test(site) ? site : '',
			year: clean(html.match(FACT('Funded IN'))?.[1] ?? '').match(YEAR)?.[0],
			country: clean(html.match(FACT('Home Base'))?.[1] ?? '')
		};
	} catch {
		return { site: '', country: '' };
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();
	const resp = await get(PAGE_URL);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const list of html.split(LIST).slice(1)) {
		const fund = list.match(FUND)?.[1];
		for (const [, path, card] of list.matchAll(CARD)) {
			const name = clean(card.match(NAME)?.[1] ?? '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const href = new URL(unescape(path), BASE_URL).href;
			const reached = Date.now() - started < DEADLINE_MS;
			if (reached && companies.length > 0) await wait(PACE_MS);
			const details: Details = reached ? await detailsOf(href) : { site: '', country: '' };
			if (details.site) withSite++;
			companies.push({
				name,
				category: [
					fund ? `Fund ${fund}` : '',
					tag(card.match(SECTOR)?.[1] ?? ''),
					tag(details.country),
					details.year ? `Invested ${details.year}` : '',
					EXITED.test(card) ? 'Exited' : ''
				]
					.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
					.join(', '),
				url: details.site || href
			});
		}
	}

	if (companies.length === 0) {
		throw new Error('trind: no companies in the portfolio grids — the markup moved');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("trind: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
