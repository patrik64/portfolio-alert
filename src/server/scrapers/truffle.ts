import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.truffle.com';
const PAGE_URL = `${BASE_URL}/en/portfolio`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// roadiz: the fintech portfolio page is a grid of cards, the whole of it in
// the page, a card a company linking its page here, with its name and a
// line about it, and an "Exit" badge for one the fund is out of; the exits
// come again in a "historical portfolio" carousel below, and the second
// card of a company is passed over. a company's page adds its sector
// ("Digital Assets", "Insurtech") and its site. the sector is kept as a
// tag, an exit with the Exited tag. a company page that will not load, or
// is not reached by the deadline, leaves its company linking it.

const CARD = /<article class="component--company([^"]*)">([\s\S]*?)<\/article>/g;
const PAGE = /<a href="([^"]*)"/;
const NAME = /class="component--company-title">([\s\S]*?)<\/h2>/;
const EXIT = /\bexit\b/;
const TAGS = /<ul class="component--meta-tags">([\s\S]*?)<\/ul>/;
const TAG = /<span>([\s\S]*?)<\/span>/g;
const SITE = /<a href="([^"]*)"[^>]*>\s*<span>Website<\/span>/;
const EXITED = /^exit(?:ed)?$/i;
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

// a company page's sectors and site, or nothing when it will not load
async function detailsOf(href: string): Promise<{ sectors: string[]; site: string }> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return { sectors: [], site: '' };
		}
		const html = await resp.text();
		const sectors = [...(html.match(TAGS)?.[1] ?? '').matchAll(TAG)].map(([, label]) => clean(label));
		const site = unescape(html.match(SITE)?.[1] ?? '').trim();
		return { sectors, site: /^https?:\/\//i.test(site) ? site : '' };
	} catch {
		return { sectors: [], site: '' };
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
	for (const [, classes, card] of html.matchAll(CARD)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const path = card.match(PAGE)?.[1];
		const href = path ? new URL(unescape(path), BASE_URL).href : '';
		const reached = !!href && Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const { sectors, site } = reached ? await detailsOf(href) : { sectors: [], site: '' };
		if (site) withSite++;
		const exited = EXIT.test(classes) || sectors.some((s) => EXITED.test(s));
		companies.push({
			name,
			category: [...sectors.filter((s) => !EXITED.test(s)).map(tag), exited ? 'Exited' : '']
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || href || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('truffle: no companies in the portfolio grid — the markup moved');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("truffle: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
