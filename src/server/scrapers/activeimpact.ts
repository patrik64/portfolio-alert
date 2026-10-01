import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.activeimpactinvestments.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: the portfolio page is a section for each fund, "Fund III",
// "Fund II", "Fund I", kept as a tag, each a run of text blocks naming a
// company ("CARBONFORGE", "jetson", as the fund writes them) over a line
// about it and a "Learn More" link to its page on the fund's site. that
// page links the company's own site ("Visit their website") and, for the
// ones the fund is out of, says so beside the name, "(ACQUIRED)". those
// pages are fetched one at a time, and a page that will not load leaves
// its company linking to it.

const SECTION = /(?=<section\b)/;
const FUND = /<h3\b[^>]*>([\s\S]*?)<\/h3>/;
const BLOCK = /<div class="sqs-html-content"[^>]*>([\s\S]*?)<\/div>/g;
const NAME = /<h4\b[^>]*>([\s\S]*?)<\/h4>/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
const HREF = /\bhref="([^"]*)"/;
// "(ACQUIRED)", a paragraph of its own beside the company's name
const OUTCOME = /<p\b[^>]*>(?:\s*<[^/][^>]*>)*\s*\(\s*((?:acquired|exited|ipo|merged|sold)[^)<]*)\)\s*(?:<\/[^>]+>\s*)*<\/p>/i;
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

// "ACQUIRED" -> "Acquired", "IPO" stays
const sentence = (s: string) => (/^ipo$/i.test(s) ? 'IPO' : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase());

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// the company's site and how the fund got out, from its page on the
// fund's site, or nothing when the page will not load; a refusal is waited
// out once
async function detailOf(page: string): Promise<{ site: string; outcome: string }> {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const resp = await fetch(page, { headers: { 'User-Agent': UA } });
			if (resp.status === 429 && attempt === 0) {
				await resp.body?.cancel();
				await wait(REFUSED_MS);
				continue;
			}
			if (!resp.ok) return { site: '', outcome: '' };
			const html = await resp.text();
			let site = '';
			for (const [, attributes, body] of html.matchAll(ANCHOR)) {
				if (!/^visit their website$/i.test(clean(body))) continue;
				const href = unescape(attributes.match(HREF)?.[1] ?? '').trim();
				if (/^https?:\/\//i.test(href) && !/activeimpactinvestments|squarespace\.com/i.test(href)) {
					site = href;
					break;
				}
			}
			const outcome = clean(html.match(OUTCOME)?.[1] ?? '');
			return { site, outcome: outcome ? sentence(outcome) : '' };
		} catch {
			return { site: '', outcome: '' };
		}
	}
	return { site: '', outcome: '' };
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const found: { name: string; fund: string; page: string }[] = [];
	const seen = new Set<string>();
	for (const chunk of html.split(SECTION).slice(1)) {
		const section = chunk.slice(0, chunk.indexOf('</section>') + 1 || undefined);
		const fund = tag(section.match(FUND)?.[1] ?? '');
		if (!/^fund\b/i.test(fund)) continue;
		for (const [, block] of section.matchAll(BLOCK)) {
			const name = clean(block.match(NAME)?.[1] ?? '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const href = unescape(block.match(LINK)?.[1] ?? '').trim();
			found.push({ name, fund, page: href ? new URL(href, BASE_URL).href : '' });
		}
	}
	if (found.length === 0) {
		throw new Error('activeimpact: no companies under the funds on the portfolio page');
	}

	const companies: ScrapedCompany[] = [];
	for (const { name, fund, page } of found) {
		const own = page.startsWith(BASE_URL);
		if (own) await wait(PACE_MS);
		const { site, outcome } = own ? await detailOf(page) : { site: '', outcome: '' };
		companies.push({
			name,
			category: [fund, outcome, outcome ? 'Exited' : ''].filter(Boolean).join(', '),
			url: site || page || PAGE_URL
		});
	}

	return companies;
}
