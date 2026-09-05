import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.serenaventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace, the portfolio a set of accordions. the company's name is the
// heading you click and its address is linked in the panel beneath, along with
// a sentence about what it does.
//
// five names end in "(acq. by Phantom)" and the like. that moves into the
// category so a company keeps its name the day it is bought — the fund marks
// one of them with an asterisk, which goes with it.

const ITEM = '<li class="accordion-item" >';
const NAME = /<span class="accordion-item__title">([^<]*)<\/span>/;
const SITE = /href="(https?:\/\/[^"]+)"/g;
const ACQUIRED = /\s*\(acq(?:uired)?\.?\s*by\s+([^)]*)\)\s*$/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const written = clean(item.match(NAME)?.[1] ?? '');
		const acquirer = written.match(ACQUIRED)?.[1];
		const name = clean(written.replace(ACQUIRED, ''));
		if (!name || seen.has(name)) continue;
		seen.add(name);

		const site = [...item.matchAll(SITE)].map((m) => m[1]).find((u) => !u.includes('serena'));
		companies.push({
			name,
			category: acquirer ? `Acquired by ${clean(acquirer)}` : '',
			url: site ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('serena: no companies on the portfolio page');
	}

	return companies;
}
