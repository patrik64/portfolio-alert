import type { ScrapedCompany } from './types';

const BASE_URL = 'https://ventures.further.ae';
const PAGE_URL = `${BASE_URL}/companies`;
const BATCH_SIZE = 10;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the companies page holds the whole collection as cards — the
// company's name, its sector and where it is, and a line about it — each
// linking the company's page here; a second copy of the list, four to a
// page, is the one the phone layout pages through, and repeats the first.
// the companies' pages write the site out as a link whose text is its
// address; they are fetched in batches for it, and a page that will not load
// leaves its company linking to that page.

const CARD = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*\bportfolioitemcontainer\b)/;
const PAGE = /<a\b[^>]*\bhref="(\/companies\/[^"#?]+)"/;
const NAME = /<h3\b[^>]*class="[^"]*\bcompanyname\b[^"]*"[^>]*>([\s\S]*?)<\/h3>/;
const TAG = /<div class="tag\b[^"]*">([\s\S]*?)<\/div>/g;
const ANCHOR = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
// the address, written out as the text of its own link
const WRITTEN_OUT = /^(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a place written "London, UK" would read as
// two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

async function siteOf(page: string): Promise<string> {
	try {
		const resp = await fetch(`${BASE_URL}${page}`, { headers: { 'User-Agent': UA } });
		if (!resp.ok) return '';
		const html = await resp.text();
		const own = [...html.matchAll(ANCHOR)].find(
			(m) => WRITTEN_OUT.test(clean(m[2])) && !/^https?:\/\/([a-z0-9-]+\.)*further\.ae\b/i.test(m[1])
		);
		return own ? unescape(own[1]) : '';
	} catch {
		return '';
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const listed: { name: string; tags: string[]; page: string }[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		listed.push({ name, tags: [...card.matchAll(TAG)].map((m) => tag(m[1])), page: card.match(PAGE)?.[1] ?? '' });
	}
	if (listed.length === 0) {
		throw new Error('further: no companies on the companies page');
	}

	const companies: ScrapedCompany[] = [];
	for (let i = 0; i < listed.length; i += BATCH_SIZE) {
		const batch = listed.slice(i, i + BATCH_SIZE);
		const sites = await Promise.all(batch.map((c) => (c.page ? siteOf(c.page) : Promise.resolve(''))));
		batch.forEach((c, j) => {
			companies.push({
				name: c.name,
				category: c.tags.filter((t, k, all) => t && all.indexOf(t) === k).join(', '),
				url: sites[j] || (c.page ? `${BASE_URL}${c.page}` : '')
			});
		});
	}

	return companies;
}
