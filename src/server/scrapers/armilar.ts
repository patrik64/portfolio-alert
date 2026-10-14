import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.armilar.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
// webflow lists at most this many items in one collection list
const LIST_CAP = 100;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page is two tabs of logos, "All" and "Active", the
// whole of each in the page, a logo — with no alt text — linking the
// company's page here. that page writes the company's name nowhere but in
// its lines ("airflows addresses…", "Armilar exited Contact on a trade
// sale with Novo Banco…"), with a link to its site, so the name is the
// earliest words there that spell the page's address or the site's name,
// whole ("A123 Systems" for a123-systems), by a part ("Usawa Care" for
// usawa) or as its ending, the shortest writing of it where the lines
// write it twice ("Nanosolar" over "Nano solar"); a page whose lines name
// the company nowhere leaves it out.
//
// a company in "All" and not in "Active" is one the fund is out of: closed
// where its lines say it is "no longer active", otherwise exited, with its
// buyer where a trade sale names one. a company page that will not load,
// or is not reached by the deadline, fails the run rather than leave its
// company out.

const TAB = /<a data-w-tab="([^"]+)"[^>]*>\s*<div class="tab-text">([^<]*)<\/div>/g;
const PANE = (tab: string) =>
	new RegExp(`<div data-w-tab="${tab}" class="w-tab-pane[^"]*">([\\s\\S]*?)(?=<div data-w-tab="|$)`);
const COMPANY = /<a href="(\/companies\/[^"]+)" class="link-portfolio-big\b/g;
const SITE = /<a href="([^"]*)" target="_blank" class="link-block-4\b/;
const LINES = /class="rich-text-block-3 w-richtext">([\s\S]*?)<\/div>/;
const PARAGRAPH = /<p\b[^>]*>([\s\S]*?)<\/p>/g;
const CLOSED = /\bno longer active\b/i;
// "…exited Contact on a trade sale with Novo Banco in October 2016", "Acquired by Superhuman"
const SALE = /\btrade sale (?:with|to) (.+?)(?=\s*\(|\s+(?:in|on|for|by)\b|,|\.|$)/i;
const ACQUIRED = /^acquired by (.+?)\.?$/i;
// a sale to the company's own people names no buyer: "its management team", "its founder"
const OWN = /^its\b/i;
const FORM = /[\s,]+(?:inc\.?|llc|ltd\.?|limited|corp\.?|plc|s\.?a\.?)$/i;
// a word as a name may be written: "A123", "Reckon.ai", "KIT-AR"
const WORD = /[\p{L}\p{N}][\p{L}\p{N}.&'’+-]*/gu;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]+>/g, ' '))
		.replace(/[\s‍]+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const spelled = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// a phrase without the punctuation or possessive it ends on: "Ynvisible’s" -> "Ynvisible"
const bare = (s: string) => s.replace(/[.,;:]+$/, '').replace(/['’]s?$/, '');

// the company's name as its lines write it — see above
function namedIn(lines: string, slug: string, site: string): string {
	const domain = site.replace(/^https?:\/\/(?:w+\.)?/i, '').split(/[/?#]/)[0];
	const host = domain.split('.')[0];
	const words = lines.match(WORD) ?? [];
	const phrases = words.flatMap((_, i) =>
		[4, 3, 2, 1].filter((n) => i + n <= words.length).map((n) => bare(words.slice(i, i + n).join(' ')))
	);
	const parts = [...slug.split('-'), ...host.split('-')].filter((part) => part.length >= 4);
	const fits: ((key: string, phrase: string) => boolean)[] = [
		(key) => [slug, host, domain].map(spelled).includes(key),
		(key) => parts.some((part) => key === spelled(part)),
		(key) =>
			key.length >= 4 &&
			[slug, host].some((k) => spelled(k).endsWith(key) || spelled(k).startsWith(key)),
		// a single word the address begins: "SAKProject" for sak
		(key, phrase) => !/\s/.test(phrase) && spelled(slug).length >= 3 && key.startsWith(spelled(slug))
	];
	for (const fit of fits) {
		const found = phrases.filter((p) => p && fit(spelled(p), p));
		if (found.length === 0) continue;
		// the fullest name the lines give ("Petra Systems" over "Petra"), and
		// of its writings the shortest ("Nanosolar" over "Nano solar")
		const longest = Math.max(...found.map((p) => spelled(p).length));
		const full = found.filter((p) => spelled(p).length === longest);
		const fewest = Math.min(...full.map((p) => p.split(' ').length));
		return full.find((p) => p.split(' ').length === fewest) ?? '';
	}
	return '';
}

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

async function fetchText(url: string): Promise<string> {
	const resp = await get(url);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

const companiesIn = (pane: string) => [...new Set([...pane.matchAll(COMPANY)].map(([, path]) => path))];

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();
	const html = await fetchText(PAGE_URL);
	const tabs = new Map([...html.matchAll(TAB)].map(([, tab, label]) => [clean(label).toLowerCase(), tab]));
	const all = companiesIn(html.match(PANE(tabs.get('all') ?? ''))?.[1] ?? '');
	const active = new Set(companiesIn(html.match(PANE(tabs.get('active') ?? ''))?.[1] ?? ''));
	if (all.length === 0 || active.size === 0) {
		throw new Error("armilar: the portfolio page's tabs moved — the companies could not be read");
	}
	if (all.length >= LIST_CAP) {
		throw new Error(`armilar: the "All" tab holds ${all.length} logos, webflow's cap — it may be partial`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const path of all) {
		if (Date.now() - started >= DEADLINE_MS) {
			throw new Error('armilar: the company pages ran past the deadline — the portfolio would be partial');
		}
		if (companies.length > 0 || seen.size > 0) await wait(PACE_MS);
		const page = await fetchText(new URL(unescape(path), BASE_URL).href);
		const site = unescape(page.match(SITE)?.[1] ?? '').trim();
		const body = page.match(LINES)?.[1] ?? '';
		const paragraphs = [...body.matchAll(PARAGRAPH)].map(([, p]) => clean(p)).filter(Boolean);
		const lines = paragraphs.join(' ');
		const name = namedIn(lines, path.split('/').pop() ?? '', site);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const held = active.has(path);
		const buyer = held
			? ''
			: (paragraphs.map((p) => p.match(ACQUIRED)?.[1] ?? p.match(SALE)?.[1] ?? '').find(Boolean) ?? '');
		const closed = !held && CLOSED.test(lines);
		companies.push({
			name,
			category: [
				buyer && !OWN.test(buyer) ? `Acquired by ${tag(buyer.replace(FORM, ''))}` : '',
				closed ? 'Closed' : held ? '' : 'Exited'
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : new URL(unescape(path), BASE_URL).href
		});
	}

	if (companies.length === 0) {
		throw new Error('armilar: the company pages name no companies — the markup moved');
	}

	return companies;
}
