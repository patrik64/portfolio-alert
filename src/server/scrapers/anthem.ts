import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://anthemvp.com/?page_id=15';
const PACE_MS = 150;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the companies page is two runs of logos,
// "Realized Investments", the ones the fund is out of, and "Current
// Investments", each named in its alt text and linking the company's page
// on the fund's site, which gives no site of its own, so that page is the
// company's link. the filter above the logos is a page for each category
// ("BioTech", "Fintech", "Platform", "Semiconductor"), listing the same
// logos; those pages are read, one at a time, for the categories, kept as
// tags.

const HEADING = /<h2\b[^>]*>([\s\S]*?)<\/h2>/g;
const LOGO = /<a\b[^>]*\bclass="company-link"[^>]*\bhref="([^"]*)"[^>]*>\s*<img\b[^>]*\balt="([^"]*)"/g;
const CATEGORY = /<li\b[^>]*\bclass="cat-item\b[^"]*"[^>]*>\s*<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
const REALIZED = /\brealized\b/i;
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
	const html = await fetchText(PAGE_URL);
	const headings = [...html.matchAll(HEADING)].map((m) => ({ at: m.index ?? 0, text: clean(m[1]) }));

	// the categories each company is filed under, from the category pages
	const categories = new Map<string, string[]>();
	const pages = new Map([...html.matchAll(CATEGORY)].map(([, href, label]) => [unescape(href).trim(), tag(label)]));
	for (const [page, label] of pages) {
		if (!/^https?:\/\//i.test(page) || !label) continue;
		await wait(PACE_MS);
		for (const [, , alt] of (await fetchText(page)).matchAll(LOGO)) {
			const key = clean(alt).toLowerCase();
			const filed = categories.get(key) ?? [];
			if (!filed.includes(label)) filed.push(label);
			categories.set(key, filed);
		}
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const logo of html.matchAll(LOGO)) {
		const name = clean(logo[2]);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const heading = headings.filter(({ at }) => at < (logo.index ?? 0)).at(-1)?.text ?? '';
		const link = unescape(logo[1]).trim();
		companies.push({
			name,
			category: [...(categories.get(name.toLowerCase()) ?? []), REALIZED.test(heading) ? 'Exited' : '']
				.filter(Boolean)
				.join(', '),
			url: /^https?:\/\//i.test(link) ? link : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('anthem: no companies on the companies page');
	}

	return companies;
}
