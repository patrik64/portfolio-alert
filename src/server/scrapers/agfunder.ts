import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://agfunder.com/portfolio/';
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the portfolio is a list of cards over
// pages linked "Next »", each naming the company, its founders' faces and
// a line about it, and linking the company's page on the fund's site,
// whose "Company Website" button links its own site. a company the fund
// is out of carries it in its name, "AI Palette [EXITED]" or "Bear Flag
// Robotics [Exit]", read as "Exited" and kept out of the name, as is a
// note in brackets ("Apeel Sciences (acquired Impact Vision)"), kept as
// the way out only when it says the company was sold. a list page that
// will not load fails the run; the company pages are fetched one at a
// time, and one that will not load, or has no such button, leaves its
// company linking to it.

const CARD = /(?=<article\b[^>]*\bclass="portfolio-item")/;
const TITLE = /class="article-title"[^>]*>\s*<h5\b[^>]*>\s*<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/;
const NEXT = /<a\b[^>]*\bclass="next page-numbers"[^>]*\bhref="([^"]*)"/;
const EXIT_MARK = /\s*\[\s*exit(?:ed)?\s*\]\s*$/i;
const NOTE = /\s*\(([^)]*)\)\s*$/;
const SOLD = /^(?:acquired by|merged with)\b/i;
const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
const HREF = /\bhref="([^"]*)"/;
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

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

// the company's site, from the "Company Website" button on its page on the
// fund's site, or nothing when the page will not load; a refusal is waited
// out once
async function siteOf(page: string): Promise<string> {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const resp = await fetch(page, { headers: { 'User-Agent': UA } });
			if (resp.status === 429 && attempt === 0) {
				await resp.body?.cancel();
				await wait(REFUSED_MS);
				continue;
			}
			if (!resp.ok) return '';
			for (const [, attributes, body] of (await resp.text()).matchAll(ANCHOR)) {
				if (!/^company website$/i.test(clean(body))) continue;
				const site = unescape(attributes.match(HREF)?.[1] ?? '').trim();
				if (/^https?:\/\//i.test(site) && !/agfunder\.com/i.test(site)) return site;
			}
			return '';
		} catch {
			return '';
		}
	}
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const cards: { written: string; page: string }[] = [];
	let url = PAGE_URL;
	for (let n = 0; n < MAX_PAGES && url; n++) {
		const html = await fetchText(url);
		for (const card of html.split(CARD).slice(1)) {
			const title = card.match(TITLE);
			if (title) cards.push({ written: clean(title[2]), page: unescape(title[1]).trim() });
		}
		const next = unescape(html.match(NEXT)?.[1] ?? '').trim();
		url = next && next !== url ? next : '';
		if (url) await wait(PACE_MS);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const { written, page } of cards) {
		const exited = EXIT_MARK.test(written);
		const marked = written.replace(EXIT_MARK, '');
		const note = marked.match(NOTE)?.[1]?.trim() ?? '';
		const name = marked.replace(NOTE, '').trim();
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const sold = SOLD.test(note) ? tag(note.replace(/^\w/, (c) => c.toUpperCase())) : '';
		const own = /^https?:\/\//i.test(page);
		if (own) await wait(PACE_MS);
		const site = own ? await siteOf(page) : '';
		companies.push({
			name,
			category: [sold, exited || sold ? 'Exited' : ''].filter(Boolean).join(', '),
			url: site || (own ? page : PAGE_URL)
		});
	}
	if (companies.length === 0) {
		throw new Error('agfunder: no companies in the portfolio');
	}

	return companies;
}
