import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.serena.vc/our-portfolio/';
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the companies page is a grid of logos, the whole portfolio in
// the page, a logo a company named in its alt text and linking the
// company's page here, with a badge on one the fund is out of — "Acquired
// by Mistral", "NYSE IPO", "Exit by MBO". a company's page adds its sector
// ("AI & Data", "SaaS"), the countries it works in ("2010 – France 🇫🇷,
// Spain 🇪🇸, & Belgium 🇧🇪", the year left unread, as the page does not
// say what it is) and its site. the sector and the countries are kept as
// tags, a buyer as "Acquired by …", a listing as IPO, and any exit with
// the Exited tag. a company page that will not load, or is not reached by
// the deadline, leaves its company linking it.

const CARD = /<a href="([^"]*)" class="Company\b[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
const NAME = /<img\b[^>]*\balt="([^"]*)"/;
const BADGE = /<span class="Company__Acquired">([\s\S]*?)<\/span>/;
const SECTOR = /class="t4 PortfolioProfile__Categories[^"]*">([\s\S]*?)<\/div>/;
const INFOS = /class="PortfolioProfile__Infos">\s*<span>([\s\S]*?)<\/span>/;
const SITE = /<a itemprop="url" href="([^"]*)"/;
const BUYER = /^acquired by\s+(.+)$/i;
const IPO = /\bipo\b/i;
// "2010 – France 🇫🇷, Spain 🇪🇸, & Belgium 🇧🇪": the year, then the countries
const YEAR_FIRST = /^\s*(?:19|20)\d{2}\s*[–—-]\s*/;
// a flag, or what is left of one the site stored without its emoji: "??"
const FLAG = /[\u{1F1E6}-\u{1F1FF}]+|\?{2,}/gu;
// a buyer's company form, whose comma would split the tag: "Synopsys, Inc."
const FORM = /,?\s+(?:inc|ltd|llc|sas|sa|gmbh)\.?$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#8211;|&ndash;/g, '–')
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

interface Page {
	site: string;
	sectors: string[];
	countries: string[];
}

// what a company's page says, or nothing when it will not load
async function pageOf(href: string): Promise<Page | null> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return null;
		}
		const html = await resp.text();
		const site = unescape(html.match(SITE)?.[1] ?? '').trim();
		return {
			site: /^https?:\/\//i.test(site) ? site : '',
			sectors: clean(html.match(SECTOR)?.[1] ?? '').split(',').map(clean),
			countries: clean(html.match(INFOS)?.[1] ?? '')
				.replace(YEAR_FIRST, '')
				.replace(FLAG, ',')
				.split(/,|&|\band\b/)
				.map(clean)
		};
	} catch {
		return null;
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const [, link, body] of html.matchAll(CARD)) {
		const name = clean(body.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const href = unescape(link).trim();
		const reached = /^https?:\/\//i.test(href) && Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const page = reached ? await pageOf(href) : null;
		if (page?.site) withSite++;
		const badge = clean(body.match(BADGE)?.[1] ?? '');
		const buyer = badge.match(BUYER)?.[1]?.replace(FORM, '');
		companies.push({
			name,
			category: [
				...(page?.sectors ?? []).map(tag),
				...(page?.countries ?? []).map(tag),
				buyer ? `Acquired by ${tag(buyer)}` : '',
				IPO.test(badge) ? 'IPO' : '',
				badge ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: page?.site || href || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('serenacapital: no companies on the companies page — the markup moved');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("serenacapital: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
