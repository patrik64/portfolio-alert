import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://alaya-capital.com/portfolio/';
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with avada and content views: the portfolio page is a grid of
// logos, each named in its alt text and linking the company's page on the
// fund's site, whose "WEB" button links its own site. those pages are
// fetched one at a time, and a page that will not load, or has no such
// button, leaves its company linking to it. nothing marks an exit.

const ITEM = /(?=<div\b[^>]*\bclass="[^"]*\bpt-cv-content-item\b)/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
const ALT = /<img\b[^>]*\balt="([^"]*)"/;
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// the company's site, from the "WEB" button on its page on the fund's
// site, or nothing when the page will not load; a refusal is waited out
// once
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
				if (!/^web$/i.test(clean(body))) continue;
				const site = unescape(attributes.match(HREF)?.[1] ?? '').trim();
				if (/^https?:\/\//i.test(site) && !/alaya-capital\.com/i.test(site)) return site;
			}
			return '';
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
	for (const chunk of html.split(ITEM).slice(1)) {
		const item = chunk.slice(0, chunk.indexOf('</a>') + 4 || undefined);
		const name = clean(item.match(ALT)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const href = unescape(item.match(LINK)?.[1] ?? '').trim();
		const page = /^https?:\/\//i.test(href) ? href : '';
		if (page) await wait(PACE_MS);
		const site = page ? await siteOf(page) : '';
		companies.push({ name, category: '', url: site || page || PAGE_URL });
	}
	if (companies.length === 0) {
		throw new Error('alaya: no companies on the portfolio page');
	}

	return companies;
}
