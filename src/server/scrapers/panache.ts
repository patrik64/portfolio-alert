import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.panache.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
// an item runs to about four thousand characters, so the last one is cut here
// rather than being left to run to the end of the page
const ITEM_LENGTH = 8000;

// wix, and unusually for wix the portfolio is written into the page: a
// repeater with an item per company holding its name, a line about it, where
// it is based and a link to it.
//
// the page also has a "filter by industry" strip with fourteen headings on it,
// but which company belongs to which is not in the page — the repeater asks
// wix for that afterwards. so the only thing the fund files a company under
// here is where it is based, and that is what the category is.

const ITEM = /role="listitem" class="[^"]*wixui-repeater__item"/g;
// the first heading in an item is the company, the second where it is based
const HEADING = /<h4[^>]*>([\s\S]*?)<\/h4>/g;
const SITE = /<a[^>]*data-testid="linkElement" href="(https?:\/\/[^"]+)"/;

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
		// wix pads its empty text elements with zero-width spaces
		.replace(/[​‌‍﻿]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a place written "Toronto, ON, Canada" would
// read as three tags rather than the one place it is
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const starts = [...html.matchAll(ITEM)].map((m) => m.index);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [i, at] of starts.entries()) {
		const item = html.slice(at, Math.min(starts[i + 1] ?? html.length, at + ITEM_LENGTH));

		const headings = [...item.matchAll(HEADING)].map((m) => clean(m[1])).filter(Boolean);
		const name = headings[0] ?? '';
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: tag(headings[1] ?? ''),
			url: item.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('panache: no companies on the portfolio page');
	}

	return companies;
}
