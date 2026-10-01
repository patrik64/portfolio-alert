import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://dreamit.com/portfolio';
const PACE_MS = 150;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page lists every company under "All
// Investments", twenty-five to a page with a link to the next, each named
// in its "Visit" link to its site, with its vertical ("Securetech",
// "Healthtech", "Urbantech"), the fund it came from ("Fund III"), its
// standing ("Active", "Acquired", "Exited") and a line about it. only the
// securetech companies are read, as before the fund's site was rebuilt,
// since the others would arrive as newcomers they are not. the fund is
// kept as a tag, and a standing other than "Active" as the way out, with
// the buyer when the line names one ("acquired in 2015 by Genoa"). the
// pages are fetched one at a time, and one that will not load fails the
// run, as the list would be short.

const VERTICAL = 'securetech';
const LIST = 'All Investments';
const NEXT = /<a\b[^>]*\bhref="\?(\w+_page=\d+)"[^>]*\bclass="w-pagination-next\b/;
const ITEM = /(?=<div class="portoflio-itemfull">)/;
const VISIT = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="link-4"[^>]*>([\s\S]*?)<\/a>/;
const FIELD = (name: string) => new RegExp(`fs-cmsfilter-field="${name}"[^>]*>([\\s\\S]*?)<\\/div>`);
const LINE = /<p class="paragraph-3">([\s\S]*?)<\/p>/;
const BUYER = /\bacquired\b(?:\s+in\s+(?:\w+\s+)?\d{4})?\s+by\s+([A-Z][^.,;()]*?)(?=\s+in\b|[.,;()]|$)/;
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
		// the list runs from its heading; the featured row above it pages on
		// its own
		const at = html.indexOf(LIST);
		if (at < 0) {
			throw new Error(`dreamit: no "${LIST}" on ${url}`);
		}
		const list = html.slice(at);
		for (const item of list.split(ITEM).slice(1)) {
			if (clean(item.match(FIELD('Vertical'))?.[1] ?? '').toLowerCase() !== VERTICAL) continue;
			const visit = item.match(VISIT);
			// "Visit Abode", and once "Vist NestEgg"
			const name = clean(visit?.[2] ?? '').replace(/^vi?sit\s+/i, '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const standing = tag(item.match(FIELD('Status'))?.[1] ?? '');
			const out = standing !== '' && !/^active$/i.test(standing);
			const buyer = out ? clean(item.match(LINE)?.[1] ?? '').match(BUYER)?.[1] : undefined;
			const site = unescape(visit?.[1] ?? '').trim();
			companies.push({
				name,
				category: [
					tag(item.match(FIELD('Fund'))?.[1] ?? ''),
					buyer ? `Acquired by ${tag(buyer)}` : out ? standing : '',
					out ? 'Exited' : ''
				]
					.filter((t, i, all) => t && all.indexOf(t) === i)
					.join(', '),
				url: /^https?:\/\//i.test(site) ? site : PAGE_URL
			});
		}
		const next = list.match(NEXT)?.[1];
		if (!next) break;
		url = `${PAGE_URL}?${next}`;
		await wait(PACE_MS);
	}
	if (companies.length === 0) {
		throw new Error('dreamit: no securetech companies in the portfolio');
	}

	return companies;
}
