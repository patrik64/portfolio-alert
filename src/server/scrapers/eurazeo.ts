import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.eurazeo.com';
const PAGE_URL = `${BASE_URL}/en/investments`;
// the page's own filter for the private equity business line: the rest of
// the investments page is private debt and real assets — loans and
// buildings rather than companies the group holds a stake in
const FILTER = 'field_business_line_target_id%5B2371%5D=2371';
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const MAX_PAGES = 100;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// drupal: the investments page shows a dozen cards and loads the rest as the
// visitor scrolls, a page at a time (?page=1, ?page=2…), until a page comes
// empty. every card opens a quick view the page carries with it: the
// company's name, the strategy that holds it ("Growth", "Venture - Digital",
// "Capital"), its status ("In portfolio" or "Divested", the way out), the
// month of the investment, its sector, its region and a link to its site.
// the strategy, the sector, the region and the year are kept as tags. the
// pages are fetched one at a time, and one that will not load fails the run,
// as the list would be short.

// the markup breaks lines inside its tags, so whitespace is matched loosely
const VIEW = /(?=<div\s+class="portefeille_quickview"\s+data-portefeille-id=")/;
const NAME = /<h3>([\s\S]*?)<\/h3>/;
const STRATEGY = /<div\s+class="tag_wrap">\s*<p\s+class="tag_name">([\s\S]*?)<\/p>/;
const FACT = /<p>\s*<strong>([^<]*)<\/strong>([\s\S]*?)<\/p>/g;
const SITE = /<a\s+class="link"\s+target="_blank"\s+href="(https?:\/\/[^"]+)"/;
const DIVESTED = /^(?:divested|exited|realised|realized)$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// one page of the list; a refusal is waited out once
async function page(n: number): Promise<string> {
	const url = `${PAGE_URL}?${FILTER}&page=${n}`;
	for (let attempt = 0; ; attempt++) {
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (resp.status === 429 && attempt === 0) {
			await resp.body?.cancel();
			await wait(REFUSED_MS);
			continue;
		}
		if (!resp.ok) {
			throw new Error(`eurazeo: page ${n} of the investments would not load (${resp.status})`);
		}
		return resp.text();
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withStatus = 0;
	for (let n = 0; n < MAX_PAGES; n++) {
		if (n > 0) await wait(PACE_MS);
		const views = (await page(n)).split(VIEW).slice(1);
		if (views.length === 0) break;
		for (const view of views) {
			const name = clean(view.match(NAME)?.[1] ?? '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());

			const facts = new Map<string, string>();
			for (const [, label, value] of view.matchAll(FACT)) facts.set(clean(label).toLowerCase(), clean(value));
			const fact = (label: string) => {
				const value = facts.get(label) ?? '';
				return UNSAID.test(value) ? '' : tag(value);
			};
			const status = facts.get('status') ?? '';
			if (status) withStatus++;
			const year = facts.get('investment date')?.match(/\b(?:19|20)\d{2}\b/)?.[0];
			const site = unescape(view.match(SITE)?.[1] ?? '').trim();

			companies.push({
				name,
				category: [
					tag(view.match(STRATEGY)?.[1] ?? ''),
					fact('sector'),
					fact('location'),
					year ? `Invested ${year}` : '',
					DIVESTED.test(status) ? 'Exited' : ''
				]
					.filter((t, i, all) => t && all.indexOf(t) === i)
					.join(', '),
				url: site || PAGE_URL
			});
		}
	}

	if (companies.length === 0) {
		throw new Error('eurazeo: no investments on the investments page');
	}
	// were the quick views' facts to move, every exit would pass for a holding
	if (withStatus === 0) {
		throw new Error("eurazeo: no investment says whether it is held — the quick view's markup moved");
	}

	return companies;
}
