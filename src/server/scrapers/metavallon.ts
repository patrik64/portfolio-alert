import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://metavallon.vc/portfolio-companies/';
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page is a grid of tiles, the whole of it in the
// page, a tile a company with its name and a line about it, linking its
// page here. a company's page is a few paragraphs, with its logo linking
// its site and its site's address written out as a link of its own; the
// paragraphs link the company's other backers too, so the site is the link
// that reads as an address, or failing that the logo's. a sale is told in
// the paragraphs ("Think Silicon was acquired by Applied Materials", "the
// exit and acquisition by Q-SYS"), and its buyer is kept with the Exited
// tag. a company page that will not load, or is not reached by the
// deadline, leaves its company linking it.

const TILE =
	/<a href="([^"]*)" class="companies__company__link">[\s\S]*?class="companies__company__title">([\s\S]*?)<\/div>/g;
const CONTENT = /id="content"([\s\S]*?)(?:class="sjb-page"|<footer\b)/;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
// the fund's own pages and the company's social profiles are not its site
const ELSEWHERE = /^https?:\/\/(?:[\w-]+\.)*(?:metavallon\.vc|facebook\.com|twitter\.com|x\.com|linkedin\.com|instagram\.com|youtube\.com)\b/i;
// a link whose text is an address: "https://think-silicon.com", "www.loctio.com"
const ADDRESS = /^(?:https?:\/\/|www\.)\S+$|^[\w-]+(?:\.[\w-]+)+\/?$/i;
const BUYER = /\b(?:was acquired by|acquisition by)\s+([\p{Lu}\d][\p{L}\d&.'’ -]*?)(?=\s+(?:in|here|marking|for)\b|[,.;:)]|$)/u;
const STEALTH = /^stealth\b/i;

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

// a company page's site and buyer, or nothing when it will not load
async function detailsOf(href: string): Promise<{ site: string; buyer: string }> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return { site: '', buyer: '' };
		}
		const content = (await resp.text()).match(CONTENT)?.[1] ?? '';
		const links = [...content.matchAll(LINK)]
			.map(([, url, text]) => ({ url: unescape(url).trim(), text: clean(text) }))
			.filter(({ url }) => !ELSEWHERE.test(url));
		// the address written out, else the logo's link, the first that holds no text
		const site =
			links.find(({ text }) => ADDRESS.test(text))?.url ?? links.find(({ text }) => !text)?.url ?? '';
		return { site, buyer: clean(content).match(BUYER)?.[1]?.trim() ?? '' };
	} catch {
		return { site: '', buyer: '' };
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();
	const resp = await get(PAGE_URL);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const [, path, title] of html.matchAll(TILE)) {
		const name = clean(title);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const href = new URL(unescape(path), PAGE_URL).href;
		const reached = Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const { site, buyer } = reached ? await detailsOf(href) : { site: '', buyer: '' };
		if (site) withSite++;
		companies.push({
			name,
			category: [buyer ? `Acquired by ${tag(buyer)}` : '', buyer ? 'Exited' : ''].filter(Boolean).join(', '),
			url: site || href
		});
	}

	if (companies.length === 0) {
		throw new Error('metavallon: no companies in the portfolio grid — the markup moved');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("metavallon: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
