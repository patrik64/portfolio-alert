import type { ScrapedCompany } from './types';

const SITE_URL = 'https://strongvc.notion.site';
const SPACE = 'strongvc';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const CHUNK_LIMIT = 100;
const MAX_CHUNKS = 20;
// notion answers the domain-to-page lookup with a cross-cell memcached error
// about three times in four, so it is asked repeatedly and, if it never
// answers, the page it named when this was written stands in
const KNOWN_PAGE = '2861b9e4-2f12-4435-9f4f-67ccd5b1ea97';
const ATTEMPTS = 6;

// the fund publishes its portfolio as a notion page, which serves an empty
// shell to anything that is not a browser. notion's own public api gives the
// document: one call resolves the domain to the page behind it, then the page
// is read in chunks until its cursor runs out.
//
// the page is a list. a bold line opens a sector — SaaS, Marketplace, Pet —
// and the lines under it name companies, each one a link, so the link's text
// is the name and its target the company.
//
// the blocks have to be walked from the root through their content arrays
// rather than taken in the order the api returns them: the api's order is not
// the document's, and reading it straight files a quarter of the companies
// under the wrong sector.

interface Block {
	id: string;
	type?: string;
	properties?: { title?: unknown[][] };
	content?: string[];
}

async function post(path: string, body: unknown) {
	let lastError: unknown;
	for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
		try {
			const resp = await fetch(`${SITE_URL}/api/v3/${path}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
				body: JSON.stringify(body)
			});
			if (!resp.ok) throw new Error(`Failed to fetch ${path}: ${resp.status}`);
			return await resp.json();
		} catch (err) {
			lastError = err;
			if (attempt < ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
		}
	}
	throw lastError;
}

// a run is [text] or [text, [["a", href], ["b"], ...]]
const runText = (run: unknown[]) => (typeof run[0] === 'string' ? run[0] : '');
const runMarks = (run: unknown[]) => (Array.isArray(run[1]) ? (run[1] as unknown[][]) : []);
const markHref = (run: unknown[]) => {
	const link = runMarks(run).find((m) => m[0] === 'a');
	return typeof link?.[1] === 'string' ? link[1] : '';
};
const isBold = (run: unknown[]) => runMarks(run).some((m) => m[0] === 'b');

export async function scrape(): Promise<ScrapedCompany[]> {
	const page = await post('getPublicPageData', {
		type: 'block-space',
		name: 'page',
		spaceDomain: SPACE,
		requestedOnPublicDomain: true,
		showMoveTo: false,
		saveParent: false,
		shouldDuplicate: false,
		projectManagementLaunch: false,
		configureOpenInDesktopApp: false,
		mobileData: { isPush: false }
	}).catch(() => null);
	const pageId: string = page?.pageId ?? page?.publicHomePage ?? KNOWN_PAGE;

	const blocks = new Map<string, Block>();
	let cursor: unknown = { stack: [] };
	for (let n = 0; n < MAX_CHUNKS; n++) {
		const chunk = await post('loadPageChunk', {
			pageId,
			limit: CHUNK_LIMIT,
			cursor,
			chunkNumber: n,
			verticalColumns: false
		});
		for (const [id, record] of Object.entries(chunk?.recordMap?.block ?? {})) {
			const value = (record as { value?: { value?: Block } })?.value?.value;
			if (value) blocks.set(id, value);
		}
		cursor = chunk?.cursor;
		if (!Array.isArray((cursor as { stack?: unknown[] })?.stack)) break;
		if ((cursor as { stack: unknown[] }).stack.length === 0) break;
	}

	// document order, which is the only order the sector headings mean anything in
	const ordered: Block[] = [];
	const walked = new Set<string>();
	const walk = (id: string) => {
		if (walked.has(id)) return;
		walked.add(id);
		const block = blocks.get(id);
		if (!block) return;
		ordered.push(block);
		for (const child of block.content ?? []) walk(child);
	};
	walk(pageId);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let sector = '';
	for (const block of ordered) {
		if (block.type !== 'text') continue;
		const title = block.properties?.title;
		if (!Array.isArray(title) || title.length === 0) continue;

		const linked = title.filter((run) => markHref(run));
		if (linked.length === 0) {
			// a bold line with nothing linked opens the next sector
			if (title.some(isBold)) sector = title.map(runText).join('').trim();
			continue;
		}
		for (const run of linked) {
			const name = runText(run).replace(/\s+/g, ' ').trim();
			if (!name || seen.has(name)) continue;
			seen.add(name);
			companies.push({ name, category: sector, url: markHref(run) });
		}
	}

	if (companies.length === 0) {
		throw new Error('strongvc: no companies on the notion page');
	}

	return companies;
}
