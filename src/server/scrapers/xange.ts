import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.xange.vc/portfolio';
// the site is Next.js over the Prismic CMS, and the CMS API is public
const API_URL = 'https://xange.cdn.prismic.io/api/v2';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the portfolio page embeds its curated startup list in the Next.js flight
// payload — every company with name, sectors and status, but no website. the
// websites live in the startups' full CMS documents, so one API query joins
// them in by uid. the page stays the authority on which companies are listed:
// the CMS holds a couple dozen startup documents beyond it.

interface StartupDoc {
	uid?: string;
	data?: {
		name?: string;
		website?: { url?: string };
		sectors?: { sector?: { data?: { name?: string } } }[];
		status?: { uid?: string };
	};
}

// slice out the array starting at `from`, tracking strings so brackets inside
// text can't end it early
function sliceArray(payload: string, from: number): string | undefined {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = from; i < payload.length; i++) {
		const ch = payload[i];
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === '\\') escaped = true;
			else if (ch === '"') inString = false;
		} else if (ch === '"') inString = true;
		else if (ch === '[') depth++;
		else if (ch === ']' && --depth === 0) return payload.slice(from, i + 1);
	}
	return undefined;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// each push carries one escaped JS string literal; parsing it as a JSON
	// string undoes the escaping, and joining restores the full payload
	const payload = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)]
		.map((m) => JSON.parse(m[1]) as string)
		.join('');

	// the page references several startup lists; the portfolio is the largest
	let listJson: string | undefined;
	for (const m of payload.matchAll(/"startups":\[/g)) {
		const arr = sliceArray(payload, m.index + m[0].length - 1);
		if (arr && arr.length > (listJson?.length ?? 0)) listJson = arr;
	}
	if (!listJson) {
		throw new Error('xange: no startups array in the page payload');
	}
	const docs = (JSON.parse(listJson) as StartupDoc[]).filter((d) => d.data?.name);
	if (docs.length < 20) {
		throw new Error(`xange: only ${docs.length} startups in the page payload`);
	}

	// look up each company's website in its full CMS document
	const apiResp = await fetch(API_URL, { headers: { 'User-Agent': UA } });
	if (!apiResp.ok) {
		throw new Error(`Failed to fetch ${API_URL}: ${apiResp.status}`);
	}
	const masterRef = ((await apiResp.json()) as { refs: { isMasterRef?: boolean; ref: string }[] })
		.refs.find((r) => r.isMasterRef)?.ref;
	if (!masterRef) {
		throw new Error('xange: the CMS API lists no master ref');
	}

	const websites = new Map<string, string>();
	for (let page = 1, pages = 1; page <= pages; page++) {
		const query = new URLSearchParams({
			ref: masterRef,
			q: '[[at(document.type,"startup")]]',
			pageSize: '100',
			page: String(page)
		});
		const search = await fetch(`${API_URL}/documents/search?${query}`, {
			headers: { 'User-Agent': UA }
		});
		if (!search.ok) {
			throw new Error(`xange: the CMS startup query failed: ${search.status}`);
		}
		const found = (await search.json()) as { total_pages: number; results: StartupDoc[] };
		pages = found.total_pages;
		for (const doc of found.results) {
			if (doc.uid && doc.data?.website?.url) websites.set(doc.uid, doc.data.website.url);
		}
	}

	return docs.map((doc) => {
		const sectors = (doc.data?.sectors ?? [])
			.map((s) => s.sector?.data?.name ?? '')
			.filter(Boolean);
		// an exit becomes an extra category tag, as on the page's cards
		if (doc.data?.status?.uid === 'exited') sectors.push('Exited');
		return {
			name: doc.data!.name!.trim(),
			category: sectors.join(', '),
			url: (doc.uid && websites.get(doc.uid)) || ''
		};
	});
}
