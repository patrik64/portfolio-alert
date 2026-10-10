import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.oxfordscienceenterprises.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js on wordpress: the portfolio page draws a card for every company,
// linking its page here, and hands its grid the companies' records in the
// payload it streams to the browser — each company's name, its site
// (written with its scheme or without), its categories, a field and the
// one above it ("Deep Tech", "Industrials"), and its stage ("Pre-Seed/Seed",
// "Series B+", "Listed" or "Exited"). the categories and the stage are kept
// as tags, a listing or an exit with the Exited tag. the cards decide who is
// listed; a card whose record is missing fails the run, as the list would
// be short. a company the record gives no site links its page here.

const FLIGHT = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
const RECORD = '{"title":"';
const CARD = /<a class="block group portfolio-item\b[^"]*" href="\/portfolio\/([^"/]+)"/g;
const OUT = /^(?:exited|listed|acquired|ipo)$/i;
const EXITED = /^exited$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Term {
	name?: string;
}

interface Company {
	title?: string;
	slug?: string;
	portfolioFields?: { websiteUrl?: string | null };
	portfolioCategories?: { nodes?: Term[] };
	portfolioStages?: { nodes?: Term[] };
}

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

// the payload the page streams, its pieces joined
function payloadOf(html: string): string {
	const chunks: string[] = [];
	for (const [, chunk] of html.matchAll(FLIGHT)) {
		try {
			chunks.push(JSON.parse(chunk));
		} catch {
			// a piece that will not parse is one the page never used either
		}
	}
	return chunks.join('');
}

// the json value opening at start — an object or an array — up to its close
function jsonAt(text: string, start: number): unknown {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < text.length; i++) {
		const c = text[i];
		if (escaped) escaped = false;
		else if (c === '\\') escaped = true;
		else if (c === '"') inString = !inString;
		else if (!inString) {
			if (c === '{' || c === '[') depth++;
			else if ((c === '}' || c === ']') && --depth === 0) {
				try {
					return JSON.parse(text.slice(start, i + 1));
				} catch {
					return undefined;
				}
			}
		}
	}
	return undefined;
}

// "djsantibodies.com" -> "https://djsantibodies.com"
function siteOf(written: string | null | undefined): string {
	const site = clean(written ?? '');
	if (!site || /\s/.test(site)) return '';
	if (/^https?:\/\//i.test(site)) return site;
	return /^[\w-]+(?:\.[\w-]+)+(?:[/?#]\S*)?$/.test(site) ? `https://${site}` : '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const payload = payloadOf(html);

	// the grid's records, by the slug of the page each links
	const records = new Map<string, Company>();
	for (let at = payload.indexOf(RECORD); at >= 0; at = payload.indexOf(RECORD, at + RECORD.length)) {
		const record = jsonAt(payload, at) as Company | undefined;
		if (record?.slug && record.portfolioFields && !records.has(record.slug)) records.set(record.slug, record);
	}

	const cards = [...new Set([...html.matchAll(CARD)].map(([, slug]) => slug))];
	if (cards.length === 0) {
		throw new Error('oxfordscience: no company cards on the portfolio page — the markup moved');
	}
	// a part of the list must not pass for the whole
	const missing = cards.filter((slug) => !records.has(slug));
	if (missing.length > 0) {
		throw new Error(
			`oxfordscience: ${missing.length} of the ${cards.length} cards have no record in the page's payload (${missing.slice(0, 3).join(', ')})`
		);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const slug of cards) {
		const record = records.get(slug)!;
		const name = clean(record.title ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const stages = (record.portfolioStages?.nodes ?? []).map((s) => tag(s.name ?? ''));
		const out = stages.some((s) => OUT.test(s));
		companies.push({
			name,
			category: [
				...(record.portfolioCategories?.nodes ?? []).map((c) => tag(c.name ?? '')),
				...stages.filter((s) => !EXITED.test(s)),
				out ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: siteOf(record.portfolioFields?.websiteUrl) || `${BASE_URL}/portfolio/${slug}`
		});
	}

	return companies;
}
