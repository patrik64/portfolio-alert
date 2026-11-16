import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.craftventures.com/portfolio';
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: since 2026-11-15 the portfolio page is one grid of tiles, a
// selection of the companies (28 of the 123 the old grid listed, its stages,
// years and exits gone with it), each a logo and a link to the company's
// site that carries the company's name as its label. a tile whose link is
// unlabelled is named by its logo's alt text. the grid is a webflow
// collection, so past a hundred tiles it would page, by the query parameter
// its own "next" link names.

const TILE = /<div\b[^>]*\brole="listitem"[^>]*>([\s\S]*?)(?=<div\b[^>]*\brole="listitem"|<\/section>|$)/g;
const LINK = /<a\b[^>]*\bclass="card-link-block\b[^>]*>/;
const LABEL = /\baria-label="([^"]*)"/;
const HREF = /\bhref="([^"]*)"/;
const LOGO = /<img\b[^>]*\balt="([^"]*)"/;
const NEXT = /href="\?([a-z0-9_]+_page)=(\d+)"[^>]*class="[^"]*w-pagination-next/;
const STEALTH = /^stealth\b/i;

const NAMED: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };

const decode = (s: string) =>
	s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (whole, dec, hex, named) => {
		if (dec) return String.fromCodePoint(Number(dec));
		if (hex) return String.fromCodePoint(parseInt(hex, 16));
		return NAMED[String(named).toLowerCase()] ?? whole;
	});

const text = (s: string) =>
	decode(s.replace(/<[^>]+>/g, ' '))
		.replace(/​/g, '')
		.replace(/ /g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

async function fetchPage(url: string) {
	let lastError: unknown;
	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			const resp = await fetch(url, { headers: { 'User-Agent': UA } });
			if (!resp.ok) {
				throw new Error(`Failed to fetch ${url}: ${resp.status}`);
			}
			return await resp.text();
		} catch (err) {
			lastError = err;
			if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
		}
	}
	throw lastError;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();

	let url = PAGE_URL;
	for (let page = 1; page <= MAX_PAGES && url; page++) {
		const html = await fetchPage(url);
		for (const [, tile] of html.matchAll(TILE)) {
			const link = tile.match(LINK)?.[0];
			if (!link) continue;
			const name = text(link.match(LABEL)?.[1] ?? '') || text(tile.match(LOGO)?.[1] ?? '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const site = decode(link.match(HREF)?.[1] ?? '').trim();
			companies.push({ name, category: '', url: /^https?:\/\//i.test(site) ? site : PAGE_URL });
		}
		const next = html.match(NEXT);
		url = next ? `${PAGE_URL}?${next[1]}=${next[2]}` : '';
	}

	if (companies.length === 0) {
		throw new Error('craft: no companies found in the portfolio');
	}

	return companies;
}
