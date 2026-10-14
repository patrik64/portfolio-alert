import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://hadeanventures.com/portfolio/';
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page is a grid of cards, the whole of it in the
// page, a card a company linking its page here, with its name, a few lines
// about it — for a company sold, the sale ("Acquired by Pharming in
// 2025") — its therapy areas ("Oncology · ADC") and an "Exit" badge where
// the fund is out of it; for the page's filters it carries its areas and
// its country as keys the filters name ("rare-disease", "sweden"). a
// company's page adds the year the fund invested, its sector
// ("Pharmaceutical") and its site. the areas, the sector, the country and
// the year are kept as tags, an exit with the Exited tag and the buyer
// where the lines name one. a company page that will not load, or is not
// reached by the deadline, leaves its company linking it.

const CARD = /(?=<div class="portfolio-card"\s)/;
const KEYS = /^<div class="portfolio-card"[^>]*\bdata-tags="([^"]*)"[^>]*\bdata-country="([^"]*)"[^>]*\bdata-url="([^"]*)"/;
const NAME = /class="portfolio-card-name">([\s\S]*?)<\/div>/;
const LINES = /class="portfolio-card-desc">([\s\S]*?)<\/div>/;
const AREAS = /class="portfolio-card-tag">([\s\S]*?)<\/span>/;
const EXIT = /class="portfolio-card-exit-badge"/;
const OPTION = /<option value="([^"]+)">([^<]*)<\/option>/g;
// "Acquired by Novo Nordisk in March 2024", "Acquired by MSD in May 2020 to …"
const BUYER = /\bacquired by\s+(.+?)(?:\s+in\b|[.,;]|$)/i;
const FACT = (label: string) =>
	new RegExp(
		`portfolio-fact-strip-label">${label}</span>\\s*<div class="portfolio-fact-strip-value">([\\s\\S]*?)</div>`,
		'i'
	);
const HREF = /<a\b[^>]*\bhref="([^"]*)"/;
const YEAR = /\b(?:19|20)\d{2}\b/;
// the keys that are not areas: the status filter's, and one it does not show
const STATUS = /^(?:all|current|exit|inactive)$/i;
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
	sector: string;
	year?: string;
}

// a company page's site, sector and year, or nothing when it will not load
async function detailsOf(href: string): Promise<Details> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return { site: '', sector: '' };
		}
		const html = await resp.text();
		const fact = (label: string) => html.match(FACT(label))?.[1] ?? '';
		const site = unescape(fact('Website').match(HREF)?.[1] ?? '').trim();
		return {
			site: /^https?:\/\//i.test(site) ? site : '',
			sector: clean(fact('Sector')),
			year: clean(fact('Year of investment')).match(YEAR)?.[0]
		};
	} catch {
		return { site: '', sector: '' };
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();
	const resp = await get(PAGE_URL);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	// the filters' labels, by the keys the cards carry
	const labels = new Map([...html.matchAll(OPTION)].map(([, key, label]) => [key.toLowerCase(), clean(label)]));
	const label = (key: string) => labels.get(key.toLowerCase()) ?? '';

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const card of html.split(CARD).slice(1)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const [, areaKeys = '', countryKeys = '', path = ''] = card.match(KEYS) ?? [];
		const href = unescape(path).trim();
		const reached = /^https?:\/\//i.test(href) && Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const details: Details = reached ? await detailsOf(href) : { site: '', sector: '' };
		if (details.site) withSite++;
		const exited = EXIT.test(card) || areaKeys.split(/\s+/).includes('exit');
		const buyer = exited ? clean(card.match(LINES)?.[1] ?? '').match(BUYER)?.[1] : undefined;
		companies.push({
			name,
			category: [
				...areaKeys
					.split(/\s+/)
					.filter((key) => key && !STATUS.test(key))
					.map((key) => tag(label(key) || key)),
				...clean(card.match(AREAS)?.[1] ?? '')
					.split('·')
					.map(tag),
				tag(details.sector),
				...countryKeys.split(/\s+/).map((key) => tag(label(key))),
				details.year ? `Invested ${details.year}` : '',
				buyer ? `Acquired by ${tag(buyer)}` : '',
				exited ? 'Exited' : ''
			]
				// "Digital Health" from the filter and the card alike, written once
				.filter(
					(t, i, all) => t && !UNSAID.test(t) && all.findIndex((u) => u.toLowerCase() === t.toLowerCase()) === i
				)
				.join(', '),
			url: details.site || href || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('hadean: no companies in the portfolio grid — the markup moved');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("hadean: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
