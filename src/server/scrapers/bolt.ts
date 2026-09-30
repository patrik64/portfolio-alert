import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://portfolio.bolt.io/';
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// cargo: the portfolio is a site of its own, a page a company, listed in a
// table the site's script draws as the reader scrolls. the first load
// carries an index of every company page as data — its title, its address
// on the site and its tags: the themes the table filters by ("Health",
// "Work Better"), the stage the fund came in at, a city, B2B or B2C, and
// "Exits" on the ones the fund is out of. a company's own site is the link
// on its page's heading, so the pages are fetched one at a time; one that
// will not load leaves its company linking to it.

const INDEX = /<script\b[^>]*\bdata-set="FirstloadThumbnails"[^>]*>([\s\S]*?)<\/script>/;
// the themes the table filters by, as its header lists them
const THEMES = new Set(['Health', 'New Family', 'Work Better', 'Industry and Transport', 'Everyday Routine', 'Sustainability']);
const STAGE = /^(?:pre-seed|seed|series\s+[a-z])$/i;
const EXIT = /^exits?$/i;
// the heading's link, under whatever bold or colour it is dressed in
const HEADING = /<h2>(?:\s*<(?:b|span|strong)\b[^>]*>)*\s*<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
const STEALTH = /^stealth\b/i;

interface Entry {
	title?: string;
	project_url?: string;
	tags?: string;
}

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

// the company's site, from the heading of its page, or nothing when the
// page will not load; a refusal is waited out once
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
			// the site's own headings link the fund and its blog; the company's names it
			const headings = [...(await resp.text()).matchAll(HEADING)].map(([, href, text]) => ({
				href: unescape(href).trim(),
				text: clean(text)
			}));
			const own = headings.find((h) => h.text.toLowerCase() === name.toLowerCase());
			return own && /^https?:\/\//i.test(own.href) ? own.href : '';
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
	const index = (await resp.text()).match(INDEX)?.[1];
	if (!index) {
		throw new Error('bolt: the portfolio site carries no index of its pages');
	}
	const entries = JSON.parse(index) as Entry[];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const entry of entries) {
		const name = clean(entry.title ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const tags = (entry.tags ?? '').split(',').map((t) => tag(t));
		const page = entry.project_url ? `${PAGE_URL}${entry.project_url}` : '';
		if (page) await wait(PACE_MS);
		const site = page ? await siteOf(page, name) : '';
		companies.push({
			name,
			category: [
				...tags.filter((t) => THEMES.has(t)),
				...tags.filter((t) => STAGE.test(t)),
				tags.some((t) => EXIT.test(t)) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: site || page || PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('bolt: no companies in the portfolio index');
	}

	return companies;
}
