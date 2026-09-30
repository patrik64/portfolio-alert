import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://brandproject.com/investments/';
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, with facetwp: the investments page holds every brand as a
// card — a photo, its logo and, on the ones the fund is out of, an
// "Exited" label — linking the brand's page on the fund's site. the names
// are only on those pages, in their titles, along with the brand's own
// site and a row of facts: the round the fund came in at ("Pre-Seed"), the
// year, the status and the category ("Health & Wellness"). so the pages
// are fetched one at a time; one that will not load fails the run, as the
// name would go with it. an old name the title keeps in brackets ("AIOS
// (Prev. Fella)") is not kept.

const CARD = /<article\b[^>]*\bclass="post-box\b[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
const PAGE = /<a\b[^>]*\bhref="(https?:\/\/[^"]*\/brand\/[^"]*)"/;
const EXITED = /\bclass="tag-exited"/;
const TITLE = /<title[^>]*>([\s\S]*?)<\/title>/;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="[^"]*\bbrand-website\b/;
const FACT = /<p class="brand-meta__label">([\s\S]*?)<\/p>\s*<p class="brand-meta__value">([\s\S]*?)<\/p>/g;
// "Wonderbelly - BrandProject"
const SITE_NAME = /\s+[-–—|]\s+BrandProject\s*$/i;
const OLD_NAME = /\s*\((?:prev(?:iously)?\.?|formerly)\s[^)]*\)\s*$/i;
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

// a brand's page; a refusal is waited out once, and a page that still will
// not load fails the run
async function brandPage(url: string): Promise<string> {
	for (let attempt = 0; ; attempt++) {
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (resp.status === 429 && attempt === 0) {
			await resp.body?.cancel();
			await wait(REFUSED_MS);
			continue;
		}
		if (!resp.ok) {
			throw new Error(`brandproject: ${url} answered ${resp.status}`);
		}
		return resp.text();
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const cards = [...html.matchAll(CARD)]
		.map(([, card]) => ({ page: unescape(card.match(PAGE)?.[1] ?? '').trim(), exited: EXITED.test(card) }))
		.filter((card) => card.page);
	if (cards.length === 0) {
		throw new Error('brandproject: no brands on the investments page');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [i, card] of cards.entries()) {
		if (i > 0) await wait(PACE_MS);
		const page = await brandPage(card.page);
		const name = clean(page.match(TITLE)?.[1] ?? '')
			.replace(SITE_NAME, '')
			.replace(OLD_NAME, '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const facts = new Map([...page.matchAll(FACT)].map(([, label, value]) => [clean(label).toLowerCase(), value]));
		const year = clean(facts.get('year') ?? '').match(/\b(?:19|20)\d{2}\b/)?.[0];
		const exited = card.exited || /^exited$/i.test(clean(facts.get('status') ?? ''));
		const site = unescape(page.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				// a brand filed under more than one category links each
				...[...(facts.get('category') ?? '').matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map(([, label]) => tag(label)),
				tag(facts.get('investment') ?? ''),
				year ? `Invested ${year}` : '',
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : card.page
		});
	}
	if (companies.length === 0) {
		throw new Error('brandproject: no brands named on their pages');
	}

	return companies;
}
