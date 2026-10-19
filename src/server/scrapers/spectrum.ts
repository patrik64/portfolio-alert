import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.spectrumequity.com';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const LIST_URL = `${PAGE_URL}_payload.json`;
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// nuxt: the portfolio page draws its tiles from a payload beside it, in
// devalue's shape — one flat array, each object's values the indexes of
// other entries — that names every company with its slug, its status
// ("Current" or "Prior"), how the fund got out ("Acquired by CBOE",
// "NASDAQ: DH") and the sectors, themes and regions it is filed under; the
// page itself names a company only in its logo's alt text, and loosely
// ("All Trails"). each company's own payload adds its site, its
// headquarters and the year the partnership began, so those are fetched one
// at a time within a time budget; a company whose payload will not load
// keeps the list's fields and links its page on the fund's site. a prior
// company is tagged "Exited" beside the fund's own words; the "Other"
// region, not being a place, is dropped.

interface Named {
	name: string;
}
interface Listed extends Named {
	slug: string;
	status: string;
	exitScenario?: string;
	sectors?: Named[];
	themes?: Named[];
	regions?: Named[];
}
interface Detail extends Listed {
	website?: { ctaLink?: string };
	headquarters?: string;
	partnershipYear?: string | number;
}

const WRAPPERS = new Set(['ShallowReactive', 'Reactive', 'Ref', 'ShallowRef']);
const OTHER = /^other$/i;
const CURRENT = /^current$/i;
const STEALTH = /^stealth\b/i;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// an entry of a devalue payload, its references followed: an object's
// values and an array's items are indexes, a wrapped value ["Ref", 3] is
// the entry it points at, and a negative index stands for nothing
function revive(arr: unknown[], i: unknown, depth = 0): unknown {
	if (typeof i !== 'number' || i < 0 || depth > 16) return undefined;
	const v = arr[i];
	if (Array.isArray(v)) {
		if (typeof v[0] === 'string') {
			return WRAPPERS.has(v[0]) ? revive(arr, v[1], depth + 1) : undefined;
		}
		return v.map((x) => revive(arr, x, depth + 1));
	}
	if (v && typeof v === 'object') {
		return Object.fromEntries(
			Object.entries(v).map(([k, x]) => [k, revive(arr, x, depth + 1)])
		);
	}
	return v;
}

const isListed = (x: unknown): x is Listed =>
	!!x &&
	typeof x === 'object' &&
	typeof (x as Listed).name === 'string' &&
	typeof (x as Listed).slug === 'string' &&
	typeof (x as Listed).status === 'string';

// the first value in the tree that `wanted` accepts
function find<T>(v: unknown, wanted: (x: unknown) => x is T, depth = 0): T | undefined {
	if (depth > 16 || !v || typeof v !== 'object') return undefined;
	if (wanted(v)) return v;
	for (const x of Array.isArray(v) ? v : Object.values(v)) {
		const hit = find(x, wanted, depth + 1);
		if (hit) return hit;
	}
	return undefined;
}

const names = (list: Named[] | undefined) =>
	(list ?? []).map((x) => tag(typeof x?.name === 'string' ? x.name : ''));

async function payload(url: string): Promise<unknown[]> {
	for (let attempt = 0; attempt < 2; attempt++) {
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (resp.status === 429 && attempt === 0) {
			await resp.body?.cancel();
			await wait(REFUSED_MS);
			continue;
		}
		if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		const arr: unknown = await resp.json();
		if (!Array.isArray(arr)) throw new Error(`${url} is not a devalue payload`);
		return arr;
	}
	throw new Error(`${url} refused the request twice`);
}

// the company's own payload, or nothing when it will not load
async function detailOf(slug: string): Promise<Detail | undefined> {
	try {
		const arr = await payload(`${PAGE_URL}${slug}/_payload.json`);
		return find(
			revive(arr, 0),
			(x): x is Detail => isListed(x) && x.slug === slug && 'website' in x
		);
	} catch {
		return undefined;
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();
	const listed = find(revive(await payload(LIST_URL), 0), (x): x is Listed[] =>
		Array.isArray(x) && x.length > 0 && x.every(isListed)
	);
	if (!listed) {
		throw new Error('spectrum: the portfolio payload lists no companies');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const company of listed) {
		const name = clean(company.name);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		let detail: Detail | undefined;
		if (Date.now() - started < DEADLINE_MS) {
			await wait(PACE_MS);
			detail = await detailOf(company.slug);
		}
		const site = clean(detail?.website?.ctaLink ?? '');
		const year = clean(String(detail?.partnershipYear ?? ''));
		const exited = !CURRENT.test(company.status);
		companies.push({
			name,
			category: [
				...names(company.sectors),
				...names(company.themes),
				...names(company.regions).filter((r) => !OTHER.test(r)),
				tag(detail?.headquarters ?? ''),
				/^\d{4}$/.test(year) ? `Invested ${year}` : '',
				tag(company.exitScenario ?? ''),
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : `${PAGE_URL}${company.slug}/`
		});
	}

	if (companies.length === 0) {
		throw new Error('spectrum: no companies in the portfolio payload');
	}
	if (!companies.some((c) => c.category)) {
		throw new Error('spectrum: the sector and status fields moved');
	}

	return companies;
}
