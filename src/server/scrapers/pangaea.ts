import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.pangaeaventures.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 8;

// squarespace. the page holds the portfolio twice over and in two different
// shapes: the companies the fund still holds are a collection of tiles, each
// linking to a page of its own, and the ones it has exited are a plain list of
// names further down, linking only to a popup on another page. reading the
// collection alone would lose the twenty-one exits, and the collection's json
// view does not carry them either.
//
// the company's own address is on its tile's page rather than the tile, behind
// a "Visit website" button, so those pages are read a batch at a time. the
// exits have no address anywhere on the site.
//
// each page also carries a line under the name, but it is a slogan rather than
// a sector — "Make It Real.", "an ounce of prevention is priceless" — so it is
// not made into a category.

const TILE = /<a class="grid-item" href="\/portfolio\/([a-z0-9-]+)">([\s\S]{0,4000}?)<\/a>/g;
const NAME = /alt="([^"]+)"/;
const EXIT = /href="#wm-popup=\/exited-companies[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
const SITE = /<a\s[^>]*href="(https?:\/\/[^"]+)"[^>]*sqs-block-button-element[^>]*>\s*Visit website/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]*>/g, ' '))
		// the fund's exit list is padded with zero-width spaces
		.replace(/[​‌‍﻿]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

async function fetchSite(slug: string): Promise<string> {
	const resp = await fetch(`${PAGE_URL}/${slug}`, { headers: { 'User-Agent': UA } });
	if (!resp.ok) return '';
	return (await resp.text()).match(SITE)?.[1] ?? '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const held = [...html.matchAll(TILE)].map((m) => ({
		slug: m[1],
		name: clean(m[2].match(NAME)?.[1] ?? '')
	}));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (let i = 0; i < held.length; i += BATCH_SIZE) {
		const batch = held.slice(i, i + BATCH_SIZE);
		const sites = await Promise.all(batch.map((c) => fetchSite(c.slug)));
		for (const [j, company] of batch.entries()) {
			if (!company.name || seen.has(company.name.toLowerCase())) continue;
			seen.add(company.name.toLowerCase());
			companies.push({ name: company.name, category: '', url: sites[j] });
		}
	}

	for (const m of html.matchAll(EXIT)) {
		const name = clean(m[1]);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: 'Exited', url: '' });
	}

	if (companies.length === 0) {
		throw new Error('pangaea: no companies on the portfolio page');
	}

	return companies;
}
