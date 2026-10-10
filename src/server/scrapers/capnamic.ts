import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://capnamic.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page holds every company as a collapsible row,
// most of them hidden until a "See full portfolio" button shows them, all
// of them in the page as it comes. a row carries the company's name in its
// logo's alt text, a line of data — the year the fund invested, the stage
// it came in at, whether the fund is still in ("Active") or out ("Exit")
// and, on some, the industry — its city, a description, its founders and
// its links, of which the one that is not a social profile is its site. an
// exit's description often says who bought the company ("acquired by
// SAP", "Strava announced the acquisition of FATMAP"), kept with the
// Exited tag; one sold in a secondary transaction is simply exited. the
// featured slider above the rows repeats a few of them and is left alone.

const ROW = /(?=<div role="listitem" class="company-row-wrapper[^"]*w-dyn-item">)/;
const META = /<div class="company-row-metadata"([^>]*)>/;
const DATUM = (name: string) => new RegExp(`\\bdata-${name}="([^"]*)"`);
const LOGO = /<img\b[^>]*\bclass="company-row-logo"[^>]*>/;
const ALT = /\balt="([^"]*)"/;
const CITY = /class="company-row-meta company-row-meta-hidden-sm">([\s\S]*?)<\/div>/;
const ABOUT = /class="company-row-description w-richtext">([\s\S]*?)<\/div>/;
const HREF = /\bhref="(https?:\/\/[^"]+)"/g;
// a profile on someone else's site, or the fund's own
const NOT_A_SITE =
	/(?:^|\.)(?:linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com|crunchbase\.com|capnamic\.com)$/i;
const ACQUIRED_BY = /\bacquired\s*by\s+([^.,;(]+?)\s*(?=[.,;(]|$)/i;
const ANNOUNCED = /\b([A-Z][\w.&'-]*(?: [A-Z][\w.&'-]*)*) announced the acquisition of\b/;
const EXIT = /^exit/i;
const UNSAID = /^(?:-|other|all|n\/a)$/i;
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
		.replace(/[​‌‍﻿]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const hostOf = (url: string) => {
	try {
		return new URL(url).hostname.toLowerCase();
	} catch {
		return '';
	}
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const rows = html.split(ROW).slice(1);
	if (rows.length === 0) {
		throw new Error('capnamic: no company rows on the portfolio page');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withStatus = 0;
	for (const row of rows) {
		const name = clean(row.match(LOGO)?.[0].match(ALT)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const meta = row.match(META)?.[1] ?? '';
		const datum = (key: string) => clean(meta.match(DATUM(key))?.[1] ?? '');
		const status = datum('status');
		if (status) withStatus++;
		const out = EXIT.test(status);
		const about = clean(row.match(ABOUT)?.[1] ?? '');
		const buyer = out ? (about.match(ACQUIRED_BY)?.[1] ?? about.match(ANNOUNCED)?.[1] ?? '') : '';
		const site = [...row.matchAll(HREF)].map(([, href]) => unescape(href).trim()).find((href) => {
			const host = hostOf(href);
			return host && !NOT_A_SITE.test(host);
		});

		companies.push({
			name,
			category: [
				UNSAID.test(datum('industry')) ? '' : tag(datum('industry')),
				UNSAID.test(datum('stage')) ? '' : tag(datum('stage')),
				tag(row.match(CITY)?.[1] ?? ''),
				/^\d{4}$/.test(datum('year')) ? `Invested ${datum('year')}` : '',
				buyer ? `Acquired by ${tag(buyer)}` : '',
				out ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: site ?? PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('capnamic: no companies in the portfolio rows');
	}
	// were the row's data to move, every exit would pass for a holding
	if (withStatus === 0) {
		throw new Error('capnamic: no row says whether the fund is in or out — the row markup moved');
	}

	return companies;
}
