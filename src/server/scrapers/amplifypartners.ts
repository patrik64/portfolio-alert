import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.amplifypartners.com/portfolio/company';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js: the portfolio page is a list of companies, each a row with its
// name, its field ("Digital Biology") and its standing ("Active",
// "Acquired", "IPO", or "Crypto" on one), opening a panel served in the
// page with its links, its site among them, and its milestones ("Founded
// 2014", "Partnered 2014", "Acquired 2023"). the field, a standing other
// than "Active", the year founded and the year the fund came in, kept as
// "Invested 2014", are tags; a sale or a listing is how the fund got out.

const CARD = /(?=<div\b[^>]*\bclass="co-card\b)/;
const NAME = /class="spotlight-co-name"[^>]*>([\s\S]*?)<\/span>/;
const META = /class="co-meta-text"[^>]*>([\s\S]*?)<\/span>/g;
const SITE = /<a\b(?=[^>]*\bco-expand-link--pill\b)[^>]*\bhref="([^"]*)"/;
const MILESTONES = /<span class="co-expand-label">Milestones<\/span>\s*<div class="co-expand-text">([\s\S]*?)<\/div>\s*<\/div>/;
// the milestones can run together, "Founded 2021Partnered 2025"
const FOUNDED = /(?:^|[^a-z])Founded\s*((?:19|20)\d{2})/i;
const INVESTED = /(?:^|[^a-z])(?:Partnered|Invested)\s*((?:19|20)\d{2})/i;
const OUT = /^(?:acquired|ipo|merged|exited)\b/i;
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
		.replace(/[​-‍﻿]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

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
	for (const card of html.split(CARD).slice(1)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const [field = '', standing = ''] = [...card.matchAll(META)].map(([, text]) => tag(text));
		const out = OUT.test(standing);
		const milestones = clean(card.match(MILESTONES)?.[1] ?? '');
		const founded = milestones.match(FOUNDED)?.[1];
		const invested = milestones.match(INVESTED)?.[1];
		const site = unescape(card.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				field,
				/^active$/i.test(standing) ? '' : standing,
				founded ? `Founded ${founded}` : '',
				invested ? `Invested ${invested}` : '',
				out ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('amplifypartners: no companies on the portfolio page');
	}

	return companies;
}
