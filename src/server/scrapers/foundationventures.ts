import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.foundationventures.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// astro, since october 2026: the squarespace site lapsed on 2026-10-21 and
// came back the next day as a single page. its "Our Companies & People"
// section is a grid of tiles, each the company's logo (its alt text the
// company's name), the fund it came from ("Fund I"), its sector and a line
// about it, and a panel the tile opens, held in a template beside it, that
// names the company again and links its site. the sector and the fund are
// kept as tags.

const TILE =
	/<button class="tile"[^>]*\bdata-panel-target="([^"]+)"[^>]*>([\s\S]*?)<\/button>\s*<template id="\1"[^>]*>([\s\S]*?)<\/template>/g;
const LOGO = /<img\b[^>]*\balt="([^"]*)"/;
const TITLE = /class="panel-title"[^>]*>([\s\S]*?)<\/h2>/;
const FUND = /class="tile__fund"[^>]*>([^<]*)</;
const SECTOR = /class="tile__industry"[^>]*>([^<]*)</;
const SITE = /<a\b[^>]*\bclass="panel-website"[^>]*\bhref="([^"]*)"|<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="panel-website"/;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
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

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, , tile, panel] of html.matchAll(TILE)) {
		const name = clean(panel.match(TITLE)?.[1] ?? '') || clean(tile.match(LOGO)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unescape(panel.match(SITE)?.slice(1).find(Boolean) ?? '').trim();
		companies.push({
			name,
			category: [tag(tile.match(SECTOR)?.[1] ?? ''), tag(tile.match(FUND)?.[1] ?? '')]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('foundationventures: no company tiles on the page — the markup moved');
	}

	return companies;
}
