import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.cervinventures.com/portfolio';
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// hubspot: the portfolio page holds three lists behind its tabs —
// "Current", "Exited", and "Previous", the investments the partners made
// before the fund, which are kept and tagged as such — each company its
// name, the rounds the fund took part in ("Seed / Series A+ / Series B")
// and a line about it. only the first round is kept, the one the fund came
// in at; the rest would only grow. a company links its page on the fund's
// site, which holds its site, its sector and the year it was founded;
// those pages are fetched one at a time, and a page that will not load
// leaves its company linking to it. a name's note in brackets, "(formerly
// Privacera)", is not part of it.

const SECTION = /(?=<div\b[^>]*\bclass="blog-section\b[^"]*"[^>]*\bid="[^"]+")/;
const SECTION_ID = /^<div\b[^>]*\bid="([^"]+)"/;
const ITEM = /(?=<div class="post-item">)/;
const PAGE = /<a\b[^>]*\bhref="([^"]*)"/;
const NAME = /class="portfolio-name"[^>]*>\s*<h2\b[^>]*>([\s\S]*?)<\/h2>/;
const ROUNDS = /class="portfolio-tags"[^>]*>([\s\S]*?)<\/div>/;
const SITE = /class="portfolio-url"[^>]*>\s*<a\b[^>]*\bhref="([^"]*)"/;
const STAT = /<div class="stat-label">([\s\S]*?)<\/div>\s*<div class="stat-desc">([\s\S]*?)<\/div>/g;
const NOTE = /\s*\([^()]*\)\s*$/;
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Detail {
	site: string;
	sector: string;
	founded: string;
}

// what the company's page on the fund's site says, or nothing when it will
// not load; a refusal is waited out once
async function detailOf(page: string): Promise<Detail> {
	const none = { site: '', sector: '', founded: '' };
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const resp = await fetch(page, { headers: { 'User-Agent': UA } });
			if (resp.status === 429 && attempt === 0) {
				await resp.body?.cancel();
				await wait(REFUSED_MS);
				continue;
			}
			if (!resp.ok) return none;
			const html = await resp.text();
			const stats = new Map(
				[...html.matchAll(STAT)].map(([, label, value]) => [clean(label).toLowerCase(), tag(value)])
			);
			const site = unescape(html.match(SITE)?.[1] ?? '').trim();
			return {
				site: /^https?:\/\//i.test(site) ? site : '',
				sector: stats.get('sector') ?? '',
				founded: stats.get('year founded')?.match(/\b(?:18|19|20)\d{2}\b/)?.[0] ?? ''
			};
		} catch {
			return none;
		}
	}
	return none;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const section of html.split(SECTION).slice(1)) {
		const list = section.match(SECTION_ID)?.[1]?.toLowerCase() ?? '';
		for (const item of section.split(ITEM).slice(1)) {
			const name = clean(item.match(NAME)?.[1] ?? '').replace(NOTE, '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const entry = tag(clean(item.match(ROUNDS)?.[1] ?? '').split('/')[0] ?? '');
			const page = unescape(item.match(PAGE)?.[1] ?? '').trim();
			const linked = /^https?:\/\//i.test(page);
			if (linked) await wait(PACE_MS);
			const detail = linked ? await detailOf(page) : { site: '', sector: '', founded: '' };
			companies.push({
				name,
				category: [
					detail.sector,
					entry,
					detail.founded ? `Founded ${detail.founded}` : '',
					list === 'previous' ? 'Previous Investment' : '',
					list === 'exited' ? 'Exited' : ''
				]
					.filter((t, i, all) => t && all.indexOf(t) === i)
					.join(', '),
				url: detail.site || (linked ? page : PAGE_URL)
			});
		}
	}
	if (companies.length === 0) {
		throw new Error('cervin: no companies on the portfolio page');
	}

	return companies;
}
