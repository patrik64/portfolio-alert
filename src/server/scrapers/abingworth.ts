import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.abingworth.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js: the portfolio page is a grid of logos drawn from its own data,
// the whole of it in the page, an entry a holding with its name, where it
// is and, by the page's filters, its status ("Active", "Exited",
// "Liquidated"), sector, strategy ("Venture Capital", "VIPEs", "Clinical
// Co-Development") and the funds that hold it ("ABV 8", "CCD 2"). the
// clinical co-development holdings are drug programmes funded alongside
// their makers ("Pfizer (1)", "SFJ II (Eisai)") rather than companies, and
// are left out. an entry links its page here, whose data gives its site.
// the sector, the strategy, the funds and the place are kept as tags, an
// exit with the Exited tag and a liquidation with the Closed tag. a
// company page that will not load, or is not reached by the deadline,
// leaves its company linking it.

const DATA = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;
const CO_DEVELOPMENT = /co-development/i;
const EXITED = /^exited$/i;
const LIQUIDATED = /liquidat/i;
// "Menlo Park, CA & Boston, MA", "New York and Jerusalem, Israel", "AUS/US"
const PLACES = /\s*(?:,|&|\/|\band\b)\s*/;
const FORM = /[\s,]+(?:inc|llc|ltd|limited|corp|gmbh|ag|sa|bv|nv|plc)\.?$/i;
const UNSAID = /^(?:-|other|others|all|n\/a|misc|active)$/i;
const STEALTH = /^stealth\b/i;

interface Ref {
	id?: string;
}

interface Entry {
	title?: string;
	uri?: string;
	location?: string | null;
	status?: Ref[];
	sector?: Ref[];
	strategy?: Ref[];
	funds?: Ref[];
}

interface Category {
	id?: string;
	title?: string;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

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

// a page's own data, as next.js writes it into the page
const pagePropsOf = (html: string) => JSON.parse(html.match(DATA)?.[1] ?? 'null')?.props?.pageProps;

// a company page's site, or nothing when it will not load
async function siteOf(href: string): Promise<string> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return '';
		}
		// a bare address is a site too: "www.alnylam.com"
		const site = clean(String(pagePropsOf(await resp.text())?.website ?? ''));
		if (/^https?:\/\//i.test(site)) return site;
		return /^[\w-]+(?:\.[\w-]+)+(?:[/?#]|$)/.test(site) ? `https://${site}` : '';
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
	const props = pagePropsOf(await resp.text());
	const entries: Entry[] = props?.entries ?? [];
	if (entries.length === 0) {
		throw new Error("abingworth: the page's data carries no portfolio — the page moved");
	}
	const labels = new Map(
		((props?.categories ?? []) as Category[]).map((c): [string, string] => [c.id ?? '', clean(c.title ?? '')])
	);
	const named = (refs: Ref[] | undefined) => (refs ?? []).map((ref) => labels.get(ref.id ?? '') ?? '').filter(Boolean);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const entry of entries) {
		const strategies = named(entry.strategy);
		if (strategies.some((s) => CO_DEVELOPMENT.test(s))) continue;
		const name = clean(entry.title ?? '').replace(FORM, '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const href = entry.uri ? new URL(entry.uri, `${BASE_URL}/`).href : '';
		const reached = !!href && Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const site = reached ? await siteOf(href) : '';
		if (site) withSite++;
		const status = named(entry.status);
		companies.push({
			name,
			category: [
				...named(entry.sector).map(tag),
				...strategies.map(tag),
				...named(entry.funds).map(tag),
				...clean(entry.location ?? '')
					.split(PLACES)
					.map(tag),
				status.some((s) => EXITED.test(s)) ? 'Exited' : '',
				status.some((s) => LIQUIDATED.test(s)) ? 'Closed' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || href || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('abingworth: the portfolio names no companies');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("abingworth: no company page gave its site — the pages' data moved");
	}

	return companies;
}
