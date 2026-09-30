import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://cleanenergyventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the cards written into the page: each current company is a
// logo linking its site, its name, a badge naming its sector ("Critical
// Minerals", "Grid"), a line about it and its co-investors. under them, a
// "Legacy Portfolio" of names alone: the exits, each with its buyer
// ("Acquired by Emerson"), and a few companies from before the fund
// ("Pre-Fund Portfolio"), which are kept, and tagged as such.

const CARD = /(?=<div\b[^>]*\bclass="company-card\b)/;
const NAME = /<h2\b[^>]*\bclass="company-name"[^>]*>([\s\S]*?)<\/h2>/;
const SITE = /<a\b[^>]*\bhref="([^"]*)"/;
const SECTOR = /class="sector-badge\b[^"]*"[^>]*>([\s\S]*?)<\//;
const LEGACY = /<div\b[^>]*\bclass="legacy-card"[^>]*>([\s\S]*?)<\/div>/g;
const PART = /<span\b[^>]*\bclass="legacy-(name|outcome|acquirer)"[^>]*>([\s\S]*?)<\/span>/g;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const split = html.search(/<section\b[^>]*\bclass="legacy-section\b/);
	const current = split < 0 ? html : html.slice(0, split);
	const legacy = split < 0 ? '' : html.slice(split);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	const add = (name: string, category: string[], url: string) => {
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) return;
		seen.add(name.toLowerCase());
		companies.push({ name, category: category.filter(Boolean).join(', '), url });
	};

	for (const card of current.split(CARD).slice(1)) {
		const site = unescape(card.match(SITE)?.[1] ?? '').trim();
		add(
			clean(card.match(NAME)?.[1] ?? ''),
			[tag(card.match(SECTOR)?.[1] ?? '')],
			/^https?:\/\//i.test(site) ? site : PAGE_URL
		);
	}
	for (const [, card] of legacy.matchAll(LEGACY)) {
		const parts = new Map([...card.matchAll(PART)].map(([, part, value]) => [part, clean(value)]));
		const outcome = [parts.get('outcome'), parts.get('acquirer')].filter(Boolean).join(' ');
		const exited = /^(acquired|merged|ipo)/i.test(outcome);
		add(parts.get('name') ?? '', [tag(outcome), exited ? 'Exited' : ''], PAGE_URL);
	}
	if (companies.length === 0) {
		throw new Error('cleanenergy: no companies on the portfolio page');
	}

	return companies;
}
