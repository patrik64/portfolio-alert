import type { ScrapedCompany } from './types';

const FEED_URL = 'https://www.ocaventures.com/page-data/portfolio/page-data.json';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// gatsby over strapi. the portfolio is in the served html, but only as prose:
// what the fund files a company under, where it sits and how it left are one
// run of text with newlines through it, and five of the seventy-five have lost
// even those, so the sector runs into the city. the page keeps a tidier copy
// of itself for its own navigation — the json gatsby writes per route — and
// that has the same cards with the fund's tags on them, which is what its
// Sector and Status filters read. so the json is read rather than the page.
//
// the fund marks an exit in two places and neither covers the other: sixteen
// companies are tagged Exited, and fourteen have an "Acquired by" line in the
// write-up. Automated Insights has the line and no tag; three of the tagged
// have no line, having left some other way. so both are read.
//
// Active is the other half of that tag and says nothing an exit does not, so
// it is dropped and only the exit is kept.
//
// where a company sits is in the prose and not in the tags, and the five whose
// prose has run together cannot be read at all, so no location is recorded
// rather than most of one. one company carries no tags and is left with no
// category until the fund gives it some.

const ACQUIRED = /\bacquired by\b/i;
const STATUS = /^(active|exited)$/i;
const EXITED = /^exited$/i;

interface Tag {
	name?: string;
}

interface Item {
	LSectionTitle?: {
		label?: string;
		descriptionRichText?: { content?: { internal?: { content?: string } } };
	};
	button?: { link?: { href?: string } };
	link?: { href?: string };
	tags?: Tag[];
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a tag written with a comma in it would read
// as two rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// the cards sit in a logoItems list somewhere under the page's own json, which
// is walked rather than reached by a path, since the path is the page's to
// rearrange
const logoItems = (node: unknown, found: Item[]) => {
	if (Array.isArray(node)) {
		for (const child of node) logoItems(child, found);
		return found;
	}
	if (node && typeof node === 'object') {
		const record = node as Record<string, unknown>;
		if (Array.isArray(record.logoItems)) found.push(...(record.logoItems as Item[]));
		for (const child of Object.values(record)) logoItems(child, found);
	}
	return found;
};

// the write-up is draft.js, kept as a string of json inside the json
const writeUp = (item: Item) => {
	const raw = item.LSectionTitle?.descriptionRichText?.content?.internal?.content;
	if (!raw) return '';
	try {
		const blocks = (JSON.parse(raw) as { blocks?: { text?: string }[] }).blocks ?? [];
		return blocks.map((block) => block.text ?? '').join(' ');
	} catch {
		return '';
	}
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(FEED_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${FEED_URL}: ${resp.status}`);
	}

	let page: unknown;
	try {
		page = await resp.json();
	} catch {
		throw new Error('oca: the portfolio came back in a shape that could not be read');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of logoItems(page, [])) {
		const name = clean(item.LSectionTitle?.label ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const tags = (item.tags ?? []).map((t) => tag(t.name ?? '')).filter(Boolean);
		const exited = tags.some((t) => EXITED.test(t)) || ACQUIRED.test(writeUp(item));

		companies.push({
			name,
			category: [...tags.filter((t) => !STATUS.test(t)), exited ? 'Exited' : '']
				.filter(Boolean)
				.join(', '),
			url: clean(item.button?.link?.href ?? item.link?.href ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('oca: no companies in the portfolio');
	}

	return companies;
}
