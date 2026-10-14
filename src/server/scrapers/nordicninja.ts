import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://nordicninja.com/portfolio/';
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page is a grid of cards, the whole of it in the
// page, a card a company linking its page here, with its name, its
// industry ("ClimateTech", "Autonomous"), the round the fund came in at
// ("Seed", "Series A") and an "Exit" badge on the ones the fund is out of.
// a company's page adds its site. the industry and the round are kept as
// tags, an exit with the Exited tag. a company page that will not load, or
// is not reached by the deadline, leaves its company linking it.

const CARD = /(?=<div\s+class="portfolio-grid__col portfolio-grid__item\b)/;
const HEADING = /<a href="([^"]*)" class="portfolio__heading\b[^"]*">([\s\S]*?)<\/a>/;
const KEYWORD = /<li class="portfolio__keyword">\s*<a\b[^>]*class="link">([^<]*)<\/a>/g;
const EXIT = /<span class="text-label">\s*Exit\s*<\/span>/i;
const SITE = /<a\s+href="([^"]*)"\s+class="button\b[^"]*\btabs-module__button\b/;
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

// the category is comma-joined, so a label holding a comma would read as two;
// the card's labels end on the comma that joins them ("ClimateTech,")
const tag = (s: string) =>
	clean(s)
		.replace(/[\s,]+$/, '')
		.replace(/\s*,\s*/g, ' / ');

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
	for (const card of html.split(CARD).slice(1)) {
		const heading = card.match(HEADING);
		const name = clean(heading?.[2] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const href = unescape(heading?.[1] ?? '').trim();
		const reached = /^https?:\/\//i.test(href) && Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const site = reached ? await siteOf(href) : '';
		if (site) withSite++;
		companies.push({
			name,
			category: [...[...card.matchAll(KEYWORD)].map(([, label]) => tag(label)), EXIT.test(card) ? 'Exited' : '']
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || href || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('nordicninja: no companies in the portfolio grid — the markup moved');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("nordicninja: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
