import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.costanoa.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the site's content store, prismic, as its api serves the public
const API_URL = 'https://costanoa.cdn.prismic.io/api/v2';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// nuxt over prismic: the portfolio page draws the two dozen companies it
// features and keeps the rest for its filters, all of them in the payload
// it ships (__NUXT_DATA__, in devalue's flattened form) — the page's own
// document, whose grid links every company as a document with its name,
// the categories it is filtered by, and two cells: the round costanoa came
// in at, and the company's latest round or, on a few exits, how it went
// ("Acquired by Mimecast"). "Featured" is a category for show, and "Exits"
// marks the ones the fund is out of. the round the fund came in at is kept;
// the latest round is not, as it would only age in a record kept as it was
// first seen.
//
// the grid's documents carry no address: a company's site is a field of
// its full document, which its own page shows and which prismic's api, open
// to the public, hands for every company in one request. the api also
// holds a company the grid does not link, so the grid alone says who is in
// the portfolio and the api only adds to it; should the api be closed, the
// companies link to their pages here.

const PAYLOAD = /<script[^>]*\bid="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;
const SHOW = /^featured$/i;
const EXITS = /^exits?$/i;
// a cell that names a round, where a few exits tell how it went instead
const ROUND = /^(?:pre-?\s?seed|seed|series\s+[a-z])\b/i;
const STEALTH = /^stealth\b/i;

interface Company {
	uid?: string;
	type?: string;
	data?: {
		name?: string;
		filter_category?: { category?: string }[];
		text_cells?: { caption?: string; text?: string }[];
	};
}

interface Found {
	results?: { uid?: string; data?: { external_link?: { url?: string } } }[];
	total_pages?: number;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

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

// the address each company's document gives, by the document's uid, or none
// when the api will not answer
async function sitesOf(): Promise<Map<string, string>> {
	const sites = new Map<string, string>();
	const headers = { 'User-Agent': UA, Accept: 'application/json' };
	try {
		const root = await fetch(API_URL, { headers });
		if (!root.ok) return sites;
		const { refs } = (await root.json()) as { refs?: { ref?: string; isMasterRef?: boolean }[] };
		const ref = refs?.find((r) => r.isMasterRef)?.ref;
		if (!ref) return sites;
		for (let page = 1, pages = 1; page <= pages && page <= 10; page++) {
			const query = new URLSearchParams({
				ref,
				q: '[[at(document.type,"company")]]',
				fetch: 'company.external_link',
				pageSize: '100',
				page: String(page)
			});
			const resp = await fetch(`${API_URL}/documents/search?${query}`, { headers });
			if (!resp.ok) break;
			const found = (await resp.json()) as Found;
			for (const doc of found.results ?? []) {
				const site = clean(doc.data?.external_link?.url ?? '');
				if (doc.uid && /^https?:\/\/[^/]/i.test(site)) sites.set(doc.uid, site);
			}
			pages = found.total_pages ?? 1;
		}
	} catch {
		// the api is closed: the grid stands on its own
	}
	return sites;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const payload = (await resp.text()).match(PAYLOAD)?.[1];
	if (!payload) {
		throw new Error('costanoa: the portfolio page carries no payload');
	}
	// the grid's links, a broken one among them that leads to no document
	const listed = [...objects(unflatten(JSON.parse(payload) as unknown[]))]
		.filter((o) => o.slice_type === 'companies_grid')
		.flatMap((grid) => ((grid.primary as { companies?: { company?: Company }[] })?.companies ?? []))
		.map((link) => link?.company)
		.filter((company): company is Company => company?.type === 'company' && !!company.data?.name);
	if (listed.length === 0) {
		throw new Error('costanoa: no companies in the payload of the portfolio page');
	}
	const sites = await sitesOf();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const { uid, data } of listed) {
		const name = clean(data?.name ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const filed = (data?.filter_category ?? []).map((c) => tag(c?.category ?? ''));
		const [first, latest] = (data?.text_cells ?? []).map((cell) => tag(cell?.text ?? ''));
		const exited = filed.some((category) => EXITS.test(category));
		companies.push({
			name,
			category: [
				...filed.filter((category) => !SHOW.test(category) && !EXITS.test(category)),
				first ?? '',
				// how an exit went, where the cell tells that rather than a round
				exited && latest && !ROUND.test(latest) ? latest : '',
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: sites.get(uid ?? '') ?? (uid ? `${PAGE_URL}/${uid}` : PAGE_URL)
		});
	}

	return companies;
}
