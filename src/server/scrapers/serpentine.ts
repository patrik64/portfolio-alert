import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.serpentine.vc';
const PAGE_URL = `${BASE_URL}/portfolio/`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// processwire: the portfolio is a grid of tiles, the whole of it in the
// page, a tile a company linking its page here, with its name and a line
// about it, and classed for the page's filter by the funds it is part of
// ("Rookie Fund", "Flagship Fund", "Diabetes Venture Fund"). the diabetes
// fund's companies are named with their country ("GlucoSet, Norway"); the
// country is kept as a tag and the name without it. a company's page adds
// its site, the year it was founded and the year the fund invested. the
// funds and the years are kept as tags; the fund does not say which
// companies it is out of. a company page that will not load, or is not
// reached by the deadline, leaves its company linking it.

const TILE = /<a href='([^']*)' class='mix item([^']*)'[\s\S]*?<\/a>/g;
const NAME = /<strong class='c_black'>([\s\S]*?)<\/strong>/;
const FILTER = /data-filter='\.(cat_\d+)'>([^<]*)</g;
// "GlucoSet, Norway", "Luna Health, US"; not "Foo, Inc."
const PLACED = /^(.+?),\s*(\p{Lu}[\p{L}. ]*)$/u;
const FORM = /^(?:inc|ltd|llc|ag|gmbh|sa|sas|ab|bv|nv|plc)\.?$/i;
const SITE = /<a class='website c_black' href='([^']*)'/;
const FACT = (label: string) => new RegExp(`<h3 class='[^']*'>${label}</h3>\\s*<p class='[^']*'>([^<]*)<`);
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

// a company page's site and years, or nothing when it will not load
async function detailsOf(href: string): Promise<{ site: string; founded?: string; invested?: string }> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return { site: '' };
		}
		const html = await resp.text();
		const site = unescape(html.match(SITE)?.[1] ?? '').trim();
		return {
			site: /^https?:\/\//i.test(site) ? site : '',
			founded: html.match(FACT('Founded in'))?.[1].match(YEAR)?.[0],
			invested: html.match(FACT('Invested since'))?.[1].match(YEAR)?.[0]
		};
	} catch {
		return { site: '' };
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();
	const resp = await get(PAGE_URL);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const funds = new Map([...html.matchAll(FILTER)].map(([, cls, label]) => [cls, tag(label)]));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const [tile, path, classes] of html.matchAll(TILE)) {
		const written = clean(tile.match(NAME)?.[1] ?? '');
		const placed = written.match(PLACED);
		const [name, place] = placed && !FORM.test(placed[2]) ? [placed[1], placed[2]] : [written, ''];
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const href = new URL(unescape(path), PAGE_URL).href;
		const reached = Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const { site, founded, invested } = reached ? await detailsOf(href) : { site: '' };
		if (site) withSite++;
		companies.push({
			name,
			category: [
				...classes
					.trim()
					.split(/\s+/)
					.map((cls) => funds.get(cls) ?? ''),
				tag(place),
				founded ? `Founded ${founded}` : '',
				invested ? `Invested ${invested}` : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || href
		});
	}

	if (companies.length === 0) {
		throw new Error('serpentine: no companies in the portfolio grid — the markup moved');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("serpentine: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
