import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.onevc.vc';
const PAGE_URL = `${BASE_URL}/`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 8;

// webflow. the portfolio is a section of the fund's one page rather than a
// page of its own, and it is a wall of logos — but the fund gave every logo
// its alt text, so the wall names the companies even though it prints nothing.
//
// what it does not carry is anything else: a logo links to the fund's page for
// the company, and the company's own address, where it sits and the stage the
// fund came in at are all printed there. so the pages are read too.
//
// the fund writes a headquarters as it pleases — São Paulo, Brazil beside Sao
// Paulo, SP and a Bogotá, Colomia — and its stage in two casings. those are
// its own words for its own companies and are left as written; a page that
// cannot be reached leaves the company with no category and the fund's page
// for an address.
//
// the year a company was founded is on those pages too. a year is not a name
// to file one under, so it is left out.

const LOGO = /<a [^>]*href="(\/portfolio\/[^"]+)"[^>]*>\s*<img[^>]*\balt="([^"]*)"/g;
const HQ = /Headquarters:<\/strong><\/div>\s*<div[^>]*>([\s\S]*?)<\/div>/;
const STAGE = /ONEVC Investment Stage:<\/strong><\/div>\s*<div[^>]*>([\s\S]*?)<\/div>/;
// the fund puts the company's own address in a block of its own
const SITE = /<div class="div-block-4">\s*<a [^>]*href="([^"]+)"/;

interface Detail {
	category: string;
	url: string;
}

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => un(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a place written "São Paulo, Brazil" would
// read as two tags rather than one, and a stage written "Series A, B, C" as
// three
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

async function fetchDetail(path: string): Promise<Detail> {
	const url = `${BASE_URL}${path}`;
	try {
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) return { category: '', url };
		const page = await resp.text();
		return {
			category: [tag(page.match(STAGE)?.[1] ?? ''), tag(page.match(HQ)?.[1] ?? '')]
				.filter(Boolean)
				.join(', '),
			url: clean(page.match(SITE)?.[1] ?? '') || url
		};
	} catch {
		return { category: '', url };
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const found: { name: string; path: string }[] = [];
	const seen = new Set<string>();
	for (const [, path, alt] of html.matchAll(LOGO)) {
		const name = clean(alt);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		found.push({ name, path });
	}
	if (found.length === 0) {
		throw new Error('onevc: the portfolio is no longer a wall of named logos');
	}

	const companies: ScrapedCompany[] = [];
	for (let start = 0; start < found.length; start += BATCH_SIZE) {
		const batch = found.slice(start, start + BATCH_SIZE);
		const details = await Promise.all(batch.map((entry) => fetchDetail(entry.path)));
		batch.forEach((entry, index) => {
			companies.push({ name: entry.name, ...details[index] });
		});
	}

	return companies;
}
