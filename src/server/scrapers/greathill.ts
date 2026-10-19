import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.greathillpartners.com';
const PAGE_URL = `${BASE_URL}/companies`;
// the page renders every page of the list up to the one asked for, so a far
// one renders them all; the count it states checks that nothing was missed
const FAR_PAGE = 50;
const PACE_MS = 150;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// nuxt 2, rendered on the server: the companies page shows twelve logo tiles
// at a time and names no company in its markup, but its state — the
// window.__NUXT__ script, a function whose arguments hold the values and
// whose body refers to them by parameter name — carries every company the
// page loaded: name, slug and the fund's word on how it got out ("Acquired
// by TA Associates", "IPO / Public Stock Sale", "Realized"; nothing for a
// company still held), along with the sectors the filter offers. the
// filter works through the address (?sector=healthcare), so the list is
// fetched once whole and once per sector, which gives each company its
// sectors by name. a company's own site is only on its page on the fund's
// site, too heavy to visit for a hundred companies each night, so companies
// link those pages instead.

interface Listed {
	slug: string;
	name: string;
	statusDescription: string;
}
interface Sector {
	name: string;
	slug: string;
}
interface State {
	companies: Listed[];
	sectors: Sector[];
	total: number;
}

const SCRIPT = /<script[^>]*>(window\.__NUXT__[\s\S]*?)<\/script>/;
const FUNCTION = /^window\.__NUXT__=\(function\(([^)]*)\)\{return ([\s\S]*?)\}\(([\s\S]*)\)\);?\s*$/;
const ARG = /"(?:[^"\\]|\\.)*"|[^,]+/g;
const COMPANY = /"Company:\d+":\{writable:true,enumerable:true,value:\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\}/g;
const SECTORS = /sectors:\[([^\]]*)\]/;
const SECTOR = /name:("(?:[^"\\]|\\.)*"|[\w$]+),slug:("(?:[^"\\]|\\.)*"|[\w$]+)/g;
const VALUE = String.raw`("(?:[^"\\]|\\.)*"|[\w$]+)`;
const STEALTH = /^stealth\b/i;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// a javascript literal from the state's argument list
function literal(token: string): unknown {
	const t = token.trim();
	if (t.startsWith('"')) {
		try {
			return JSON.parse(t);
		} catch {
			return t.slice(1, -1);
		}
	}
	if (t === 'true' || t === 'false') return t === 'true';
	if (t === 'null' || t === 'void 0') return undefined;
	return /^-?\d+(?:\.\d+)?$/.test(t) ? Number(t) : t;
}

function decode(html: string, url: string): State {
	const m = (html.match(SCRIPT)?.[1] ?? '').match(FUNCTION);
	if (!m) {
		throw new Error(`greathill: ${url} carries no nuxt state`);
	}
	const params = m[1].split(',');
	const args = m[3].match(ARG) ?? [];
	const env = new Map(params.map((p, i) => [p, literal(args[i] ?? '')]));
	const body = m[2];
	// a value in the body: a literal, or the parameter that stands for one
	const value = (token: string): string => {
		const v = token.startsWith('"') ? literal(token) : env.has(token) ? env.get(token) : token;
		return v === undefined || v === null ? '' : String(v);
	};
	const field = (entry: string, name: string) =>
		value(entry.match(new RegExp(`(?:^|,)${name}:${VALUE}`))?.[1] ?? '');

	const companies = [...body.matchAll(COMPANY)].map(([, entry]) => ({
		slug: field(entry, 'slug'),
		name: field(entry, 'name'),
		statusDescription: field(entry, 'statusDescription')
	}));
	const sectors = [...(body.match(SECTORS)?.[1] ?? '').matchAll(SECTOR)].map(([, name, slug]) => ({
		name: value(name),
		slug: value(slug)
	}));
	const total = Number(value(body.match(new RegExp(`totalCount:${VALUE}`))?.[1] ?? '')) || 0;
	return { companies, sectors, total };
}

async function listing(query: string): Promise<State> {
	const url = `${PAGE_URL}?${query}page=${FAR_PAGE}`;
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return decode(await resp.text(), url);
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const all = await listing('');
	if (all.companies.length === 0) {
		throw new Error('greathill: no companies in the page state');
	}
	if (all.total && all.companies.length !== all.total) {
		throw new Error(
			`greathill: the state holds ${all.companies.length} companies but the page counts ${all.total}`
		);
	}
	if (all.sectors.length === 0) {
		throw new Error('greathill: the sector filter is gone from the page state');
	}

	// which companies each sector's own listing names
	const sectorsOf = new Map<string, string[]>();
	for (const sector of all.sectors) {
		await wait(PACE_MS);
		const { companies } = await listing(`sector=${encodeURIComponent(sector.slug)}&`);
		for (const c of companies) {
			sectorsOf.set(c.slug, [...(sectorsOf.get(c.slug) ?? []), tag(sector.name)]);
		}
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const c of all.companies) {
		const name = clean(c.name);
		if (!name || !c.slug || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const status = tag(c.statusDescription);
		companies.push({
			name,
			category: [...(sectorsOf.get(c.slug) ?? []), status, status ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: `${PAGE_URL}/${c.slug}`
		});
	}

	if (companies.length === 0) {
		throw new Error('greathill: no companies on the list');
	}
	if (sectorsOf.size === 0) {
		throw new Error('greathill: the sector listings name no companies');
	}

	return companies;
}
