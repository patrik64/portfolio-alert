import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.svhealthinvestors.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the company panels are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no panel is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// craft: the portfolio page is a grid of the fund's current deals, the
// whole of it in the page, a card a company named in its title, with where
// it is ("United States", "UK") and, for the page's filter, its strategy
// ("Therapeutics", "Healthcare Growth", "Medtech"), opening a panel drawn
// from the company's page here, which links its site. below the grid the
// exited investments are a plain list of names, a name now and then with
// its legal form or a note in brackets ("AeroCare Holdings, Inc.",
// "Ophthotech (now Iveric bio)"), which are not part of it — a current
// card's title, too, now and then carries its legal form. the strategy
// and the place are kept as tags, an exit with the Exited tag. a panel that
// will not load, or is not reached by the deadline, leaves its company
// linking the portfolio page.

const CARD =
	/<li\s+data-location="([^"]*)"\s+data-sector="([^"]*)"[^>]*>\s*<a href="#portfolio-([^"]+)" title="([^"]*)" class="portfolio-card"/g;
const STRATEGY = /<select name="sector">([\s\S]*?)<\/select>/;
const OPTION = /<option value="([^"]+)">([^<]*)<\/option>/g;
const EXITS = /<section class="portfolio-historic">([\s\S]*?)<\/section>/;
const EXITED = /<li>([\s\S]*?)<\/li>/g;
const LINK = /href="(https?:\/\/[^"]+)"/g;
const NOTE = /\s*\([^()]*\)\s*$/;
const FORM = /[\s,]+(?:inc\.?|llc|ltd\.?|limited|corp\.?|ag|gmbh|plc)$/i;
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

// "AeroCare Holdings, Inc." -> "AeroCare Holdings", "Ophthotech (now Iveric bio)" -> "Ophthotech"
function nameOf(written: string): string {
	let name = written;
	for (let before = ''; before !== name; ) {
		before = name;
		name = name.replace(NOTE, '').replace(FORM, '').trim();
	}
	return name || written;
}

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

// a company panel's site — its first link off the fund's own — or nothing when it will not load
async function siteOf(slug: string): Promise<string> {
	try {
		const resp = await get(`${PAGE_URL}/${encodeURIComponent(slug)}`);
		if (!resp.ok) {
			await resp.body?.cancel();
			return '';
		}
		const html = await resp.text();
		return (
			[...html.matchAll(LINK)]
				.map(([, href]) => unescape(href).trim())
				.find((href) => !/^https?:\/\/(?:www\.)?svhealthinvestors\.com\b/i.test(href)) ?? ''
		);
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
	// the strategies, by the key each card is filtered under
	const strategies = new Map(
		[...(html.match(STRATEGY)?.[1] ?? '').matchAll(OPTION)].map(([, key, label]) => [key, tag(label)])
	);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const [, place, sector, slug, title] of html.matchAll(CARD)) {
		const name = nameOf(clean(title));
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const reached = Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const site = reached ? await siteOf(unescape(slug)) : '';
		if (site) withSite++;
		companies.push({
			name,
			category: [strategies.get(sector) ?? '', tag(place)]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || PAGE_URL
		});
	}

	for (const [, written] of (html.match(EXITS)?.[1] ?? '').matchAll(EXITED)) {
		const name = nameOf(clean(written));
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: 'Exited', url: PAGE_URL });
	}

	if (companies.length === 0) {
		throw new Error('svhealth: no companies on the portfolio page — the markup moved');
	}
	// without the panels every current company would link the portfolio page
	if (withSite === 0) {
		throw new Error("svhealth: no company panel gave its site — the panels' markup moved");
	}

	return companies;
}
