import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://firststar.vc/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the whole collection on the one page: every item names the
// company, says what it does, lists the categories the fund files it under
// as finsweet filter fields ("ai", "dev tools", "bio+compute") and links its
// site from a cover over the card. a company the fund is out of wears an
// "acquired" tag; the tag sits on every card, hidden by webflow's conditional
// visibility on the ones that keep their company. the categories are written
// in lowercase and capitalized here as the page's stylesheet shows them.

const ITEM = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*\bcompanies-cms-item\b)/;
const NAME = /class="alt-text-32px[^"]*">([\s\S]*?)<\/div>/;
const TAG = /<div class="tag([^"]*)">\s*<div[^>]*>([\s\S]*?)<\/div>/;
const CATEGORY = /fs-list-field="category"[^>]*>([\s\S]*?)<\/div>/g;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*class="[^"]*\blink-cover\b/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&')
		// the descriptions open with zero-width spaces
		.replace(/[​‌‍﻿]/g, '');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// "dev tools" -> "Dev Tools", "bio+compute" -> "Bio+Compute", "ai" -> "AI"
const titled = (s: string) =>
	clean(s)
		.replace(/\s*,\s*/g, ' / ')
		.split(/(\s+|\+)/)
		.map((part) => (/^ai$/i.test(part) ? 'AI' : part.charAt(0).toUpperCase() + part.slice(1)))
		.join('');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const tagged = item.match(TAG);
		const status = tagged && !/w-condition-invisible/.test(tagged[1]) ? clean(tagged[2]) : '';
		const exited = /acquired|exit|ipo|merged/i.test(status);
		companies.push({
			name,
			category: [
				...[...item.matchAll(CATEGORY)].map((m) => titled(m[1])),
				status ? status.charAt(0).toUpperCase() + status.slice(1) : '',
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: unescape(item.match(SITE)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('firststar: no companies on the companies page');
	}

	return companies;
}
