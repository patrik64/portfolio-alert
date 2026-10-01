import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.alix.vc';
const PAGE_URL = `${BASE_URL}/portfolio-1`;
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: the portfolio page's "Current Investments" is a grid of
// columns, each a picture, the company's name as a heading, a quoted line
// about it and, on some, a "Learn more" link to its page on the fund's
// site, whose "Visit Website" button links its own site; one of those
// buttons links another company's, so a link written out with the
// company's own name is taken first. a sale is a second heading under the
// name, "(Acquired by Gingko Bioworks)", kept without its brackets. the
// "Extended Family" below are the funds the fund invests beside, and are
// not read, nor are the companies named only "Stealth". the companies'
// pages are fetched one at a time, and a page that will not load leaves
// its company linking to it.

const SECTION_START = '>Current Investments<';
const SECTION_END = '>Extended Family<';
const COLUMN = /(?=<div class="col sqs-col-3 span-3">)/;
const HEADING = /<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/g;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
const HREF = /\bhref="([^"]*)"/;
const OUTCOME = /^\(\s*((?:acquired|merged|ipo|public)\b[^)]*)\)$/i;
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

// the company's site, from its page on the fund's site: a link written out
// with its name, else the "Visit Website" button; nothing when the page
// will not load, a refusal waited out once
async function siteOf(page: string, name: string): Promise<string> {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const resp = await fetch(page, { headers: { 'User-Agent': UA } });
			if (resp.status === 429 && attempt === 0) {
				await resp.body?.cancel();
				await wait(REFUSED_MS);
				continue;
			}
			if (!resp.ok) return '';
			const outside = [...(await resp.text()).matchAll(ANCHOR)]
				.map(([, attributes, body]) => ({ href: unescape(attributes.match(HREF)?.[1] ?? '').trim(), text: clean(body) }))
				.filter(({ href }) => /^https?:\/\//i.test(href) && !/alix\.vc|squarespace/i.test(href));
			const named = outside.find(({ text }) => text.toLowerCase() === name.toLowerCase());
			const button = outside.find(({ text }) => /^visit website$/i.test(text));
			return (named ?? button)?.href ?? '';
		} catch {
			return '';
		}
	}
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const start = html.indexOf(SECTION_START);
	if (start < 0) {
		throw new Error('alix: no "Current Investments" on the portfolio page');
	}
	const end = html.indexOf(SECTION_END, start);
	const section = html.slice(start, end < 0 ? undefined : end);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const column of section.split(COLUMN).slice(1)) {
		const [name = '', ...rest] = [...column.matchAll(HEADING)].map(([, heading]) => clean(heading));
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const went = rest.map((heading) => heading.match(OUTCOME)?.[1]).find(Boolean) ?? '';
		const href = unescape(column.match(LINK)?.[1] ?? '').trim();
		const page = href ? new URL(href, BASE_URL).href : '';
		const own = page.startsWith(BASE_URL) && page !== `${BASE_URL}/`;
		if (own) await wait(PACE_MS);
		const site = own ? await siteOf(page, name) : '';
		companies.push({
			name,
			category: went ? [tag(went), 'Exited'].join(', ') : '',
			url: site || (own ? page : PAGE_URL)
		});
	}
	if (companies.length === 0) {
		throw new Error('alix: no companies under "Current Investments"');
	}

	return companies;
}
