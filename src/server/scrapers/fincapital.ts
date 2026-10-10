import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.fin.capital/portfolio';
const PACE_MS = 150;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, since october 2026 (the site was next.js before): the portfolio
// is a list of logo cards, a hundred to a page with a link to the next,
// each opening a panel that names the company over a line about it. the
// card carries the sub-sector the fund files the company under
// ("DeepTech", "Payments"), the stage ("Early", "Growth") and whether it is
// active or exited, kept as tags, with "Exited" the way out. the new page
// links no company's site, so a company links the page. the pages are
// fetched one at a time, and one that will not load fails the run, as the
// list would be short.

// a company stored under the name the old site gave it, which the new one
// spells without its accent: a moved name would read as a newcomer
const STORED_AS: Record<string, string> = { 'Portao 3': 'Portão 3' };

const NEXT = /<a\b[^>]*\bhref="\?(\w+_page=\d+)"[^>]*\bclass="[^"]*\bw-pagination-next\b/;
const ITEM = /(?=<div data-popup="open" role="listitem" class="insight-item w-dyn-item">)/;
const NAME = /<h2 class="h2-small[^"]*">([\s\S]*?)<\/h2>/;
const FIELD = (name: string) => new RegExp(`fs-list-field="${name}"[^>]*>([\\s\\S]*?)<\\/p>`);
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

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let url = PAGE_URL;
	for (let page = 1; page <= 50; page++) {
		const html = await fetchText(url);
		const items = html.split(ITEM).slice(1);
		if (items.length === 0) {
			throw new Error(`fincapital: no companies on ${url}`);
		}
		for (const item of items) {
			const written = clean(item.match(NAME)?.[1] ?? '');
			const name = STORED_AS[written] ?? written;
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const status = clean(item.match(FIELD('status'))?.[1] ?? '');
			const exited = /^exit/i.test(status);
			companies.push({
				name,
				category: [
					tag(item.match(FIELD('category'))?.[1] ?? ''),
					tag(item.match(FIELD('stage'))?.[1] ?? ''),
					exited || /^active$/i.test(status) ? '' : tag(status),
					exited ? 'Exited' : ''
				]
					.filter((t, i, all) => t && all.indexOf(t) === i)
					.join(', '),
				url: PAGE_URL
			});
		}
		const next = html.match(NEXT)?.[1];
		if (!next) break;
		url = `${PAGE_URL}?${next}`;
		await wait(PACE_MS);
	}

	if (companies.length === 0) {
		throw new Error('fincapital: the page carries no companies');
	}

	return companies;
}
