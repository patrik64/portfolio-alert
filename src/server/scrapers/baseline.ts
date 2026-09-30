import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.baselinev.com/investments/';
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the investments page is a wall of logos,
// each turning over to a line about the company and, on the ones that
// have gone, how: "IPO 2021", "Acquired by Twitter, 2013", now and then
// "Invested in 2009, IPO 2021". a logo links the company's page on the
// fund's site, which names it in the link's title and holds its own site
// under "Web:". those pages are fetched one at a time, and a page that
// will not load leaves its company linking to it.

const ITEM = /(?=<div class="investments-item">)/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"[^>]*\btitle="([^"]*)"[^>]*\bclass="item__content"/;
const NOTE = /class="acquisition-info"[^>]*>([\s\S]*?)<\/div>/;
const SITE = /<strong>\s*Web:?\s*<\/strong>\s*<a\b[^>]*\bhref="([^"]*)"/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// what the note says of the exit, the years left off: "Invested in 2009,
// IPO 2021" -> "IPO", "Acquired by Twitter, 2013" -> "Acquired by Twitter"
function outcome(note: string): string {
	const said = clean(note)
		.replace(/^invested in\s+(?:19|20)\d{2}\s*,?\s*/i, '')
		.replace(/,?\s*(?:19|20)\d{2}\s*\.?$/, '')
		.replace(/\s*,\s*/g, ' / ')
		.trim();
	return said.replace(/^ipo\b/i, 'IPO').replace(/^acquired by\b/i, 'Acquired by');
}

// the company's site, from its page on the fund's site, or nothing when
// the page will not load; a refusal is waited out once
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
			const site = unescape((await resp.text()).match(SITE)?.[1] ?? '').trim();
			return /^https?:\/\//i.test(site) ? site : '';
		} catch {
			return '';
		}
	}
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const [, href = '', title = ''] = item.match(LINK) ?? [];
		const name = clean(title);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const page = unescape(href).trim();
		const went = outcome(item.match(NOTE)?.[1] ?? '');
		if (page) await wait(PACE_MS);
		const site = /^https?:\/\//i.test(page) ? await siteOf(page) : '';
		companies.push({
			name,
			category: [went, went ? 'Exited' : ''].filter(Boolean).join(', '),
			url: site || page || PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('baseline: no companies on the investments page');
	}

	return companies;
}
