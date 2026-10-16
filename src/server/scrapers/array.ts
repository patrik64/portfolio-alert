import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.array.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// astro, a static page since october 2026 — before it, a next.js home page
// whose script carried the lists: the portfolio page is two panels of
// tiles, the companies held and the exits, the whole of each in the page,
// a tile a company linking its page here, with its name and, for one held,
// its category and stage ("AI Agents · Series C"), for an exit its buyer
// and the year ("Drata, 2024"). a company's page gives its site. the
// category and the stage are kept as tags, a sale as "Acquired by" the
// buyer with the Exited tag, the year left out as before. two companies
// the fund once wrote with a second name ("Eventual / DAFT") are stored
// under that, and keep it so they do not come up as new. both panels must
// be in the page; a company page that will not load, or is not reached by
// the deadline, leaves its company linking it.

const PANEL = /<section\b[^>]*\bid="panel-(active|exits)"[^>]*>([\s\S]*?)<\/section>/g;
const TILE = /<a href="([^"]*)" class="tile group[\s\S]*?<\/a>/g;
const NAME = /aria-hidden="true" class="text-\[14px\] font-bold"[^>]*>([^<]*)</;
const INFO = /class="text-ink-faint mt-2 line-clamp-2[^"]*"[^>]*>([^<]*)</;
// "Drata, 2024": the buyer and the year of the sale
const SALE = /^(.+?),\s*(?:19|20)\d{2}$/;
const SITE = /<a href="(https?:\/\/[^"]*)"[^>]*class="bg-ink text-paper/;
const STEALTH = /^stealth\b/i;

// the fund's spelling now, and the one the company is stored under
const STORED_AS: Record<string, string> = {
	Eventual: 'Eventual / DAFT',
	OpsVerse: 'OpsVerse / DevOpsNow'
};

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

// a company page's site, or nothing when it will not load
async function siteOf(href: string): Promise<string> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return '';
		}
		return unescape((await resp.text()).match(SITE)?.[1] ?? '').trim();
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
	const panels = new Map([...html.matchAll(PANEL)].map(([, which, body]) => [which, body]));
	if (!panels.has('active') || !panels.has('exits')) {
		throw new Error('array: the portfolio page is missing a panel — the markup moved');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const [which, body] of panels) {
		for (const [tile, path] of body.matchAll(TILE)) {
			const written = clean(tile.match(NAME)?.[1] ?? '');
			const name = STORED_AS[written] ?? written;
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const href = new URL(unescape(path), BASE_URL).href;
			const reached = Date.now() - started < DEADLINE_MS;
			if (reached && companies.length > 0) await wait(PACE_MS);
			const site = reached ? await siteOf(href) : '';
			if (site) withSite++;
			const info = clean(tile.match(INFO)?.[1] ?? '');
			const exited = which === 'exits';
			const buyer = exited ? info.match(SALE)?.[1] : undefined;
			companies.push({
				name,
				category: [
					...(exited ? [buyer ? `Acquired by ${tag(buyer)}` : tag(info)] : info.split(/\s+·\s+/).map(tag)),
					exited ? 'Exited' : ''
				]
					.filter((t, i, all) => t && all.indexOf(t) === i)
					.join(', '),
				url: site || href
			});
		}
	}

	if (companies.length === 0) {
		throw new Error('array: no companies in the portfolio panels — the markup moved');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("array: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
