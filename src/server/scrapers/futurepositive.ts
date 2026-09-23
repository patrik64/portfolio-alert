import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.futurepositivecapital.com';
const PAGE_URL = `${BASE_URL}/companies`;
const BATCH_SIZE = 8;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// nuxt over craft: the companies page draws its cards from the payload it
// ships (__NUXT_DATA__, in devalue's flattened form), where each company
// carries the slugs of its industry, technology and country categories, the
// same payload spelling each out. a company's site is only on its own page,
// written under "LINK" beside its headquarters; those pages are fetched in
// batches, and a page that will not load leaves its company linking to that
// page.

const PAYLOAD = /<script[^>]*\bid="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;
const LINK = /<div class="meta__title">\s*LINK\s*<\/div>\s*<div class="meta__value">\s*<a\b[^>]*\bhref="([^"]+)"/i;
const STEALTH = /^stealth\b/i;

interface Entry {
	title?: string;
	uri?: string;
	categoriesIndustry?: { slug?: string }[];
	categoriesTechnologyScience?: { slug?: string }[];
	categoriesCountry?: { slug?: string }[];
}

interface Category {
	title?: string;
	slug?: string;
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// devalue's flattened array back into the values it stands for; nuxt wraps
// its state in reactive markers, which are seen through
function unflatten(flat: unknown[]): unknown {
	const done = new Map<number, unknown>();
	const hydrate = (index: number): unknown => {
		if (index < 0) return undefined;
		if (done.has(index)) return done.get(index);
		const value = flat[index];
		if (!value || typeof value !== 'object') {
			done.set(index, value);
			return value;
		}
		if (Array.isArray(value)) {
			if (typeof value[0] === 'string') {
				const [type, ...rest] = value as [string, ...number[]];
				if (/^(Shallow)?(Reactive|Ref)$|^EmptyRef$|^EmptyShallowRef$/.test(type)) {
					const inner = hydrate(rest[0]);
					done.set(index, inner);
					return inner;
				}
				if (type === 'Date' || type === 'Set' || type === 'Map' || type === 'null') {
					done.set(index, null);
					return null;
				}
			}
			const list: unknown[] = [];
			done.set(index, list);
			for (const i of value as number[]) list.push(hydrate(i));
			return list;
		}
		const object: Record<string, unknown> = {};
		done.set(index, object);
		for (const [key, i] of Object.entries(value as Record<string, number>)) object[key] = hydrate(i);
		return object;
	};
	return hydrate(0);
}

// every object in the payload, however deep
function* objects(value: unknown, seen = new Set<unknown>()): Generator<Record<string, unknown>> {
	if (!value || typeof value !== 'object' || seen.has(value)) return;
	seen.add(value);
	if (Array.isArray(value)) {
		for (const item of value) yield* objects(item, seen);
		return;
	}
	yield value as Record<string, unknown>;
	for (const item of Object.values(value)) yield* objects(item, seen);
}

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);
	const payload = html.match(PAYLOAD)?.[1];
	if (!payload) {
		throw new Error('futurepositive: the companies page carries no payload');
	}
	const all = [...objects(unflatten(JSON.parse(payload) as unknown[]))];

	const entries = (all.find(
		(o) =>
			Array.isArray(o.entries) &&
			(o.entries as Entry[]).some((e) => e && typeof e.uri === 'string' && e.uri.startsWith('companies/'))
	)?.entries ?? []) as Entry[];
	const labels = new Map<string, string>();
	for (const o of all) {
		for (const key of ['industry', 'technologyScience', 'country']) {
			if (!Array.isArray(o[key])) continue;
			for (const c of o[key] as Category[]) if (c?.slug && c.title) labels.set(c.slug, tag(c.title));
		}
	}

	const listed = entries.filter((e) => e?.title && e.uri?.startsWith('companies/'));
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (let i = 0; i < listed.length; i += BATCH_SIZE) {
		const batch = listed.slice(i, i + BATCH_SIZE);
		const pages = await Promise.all(batch.map((e) => fetchText(`${BASE_URL}/${e.uri}`).catch(() => '')));
		batch.forEach((entry, j) => {
			const name = clean(entry.title ?? '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) return;
			seen.add(name.toLowerCase());
			const slugs = [
				...(entry.categoriesIndustry ?? []),
				...(entry.categoriesTechnologyScience ?? []),
				...(entry.categoriesCountry ?? [])
			].map((c) => c?.slug ?? '');
			companies.push({
				name,
				category: slugs
					.map((slug) => labels.get(slug) ?? '')
					.filter((t, k, list) => t && list.indexOf(t) === k)
					.join(', '),
				url: unescape(pages[j].match(LINK)?.[1] ?? '') || `${BASE_URL}/${entry.uri}`
			});
		});
	}

	if (companies.length === 0) {
		throw new Error('futurepositive: no companies in the companies page payload');
	}

	return companies;
}
