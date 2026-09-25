import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.fitchventures.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a vite single-page app on s3: the portfolio page is an empty shell and the
// companies travel inside the site's one script, whose name is hashed per
// build and so read off the page each run. each company is an object there —
// its name, the category and thesis the fund files it under, its stage
// ("Seed", "Series B"), its status, "active" or "past", and for a past one how
// it went ("Acquired by Cube (2025)"), with its site where the fund gives
// one. the exit's note is kept, its year and all, with the Exited tag.

const SCRIPT = /<script\b[^>]*\bsrc="(\/assets\/index-[^"]+\.js)"/;
const COMPANY = /\{schemaVersion:`[^`]*`,contentType:`portfolio-company`,([^{}]*)\}/g;
const FIELD = /(\w+):(?:`([^`]*)`|([^,}]+))/g;
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

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const page = await fetchText(PAGE_URL);
	const script = page.match(SCRIPT)?.[1];
	if (!script) {
		throw new Error('fitch: the portfolio page names no script to read the companies from');
	}
	const bundle = await fetchText(`${BASE_URL}${script}`);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, body] of bundle.matchAll(COMPANY)) {
		const fields = new Map<string, string>();
		for (const [, key, quoted, bare] of body.matchAll(FIELD)) fields.set(key, quoted ?? bare ?? '');
		const name = clean(fields.get('name') ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const past = fields.get('status') === 'past';
		const stage = tag(fields.get('stage') ?? '');
		companies.push({
			name,
			category: [
				tag(fields.get('category') ?? ''),
				// an active company's stage; a past one's note of the way out, or
				// its stage, which says the same with the year
				past ? tag(fields.get('exitNote') ?? '') || stage : stage,
				past ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: unescape(fields.get('website') ?? '').trim()
		});
	}

	if (companies.length === 0) {
		throw new Error('fitch: no companies in the site script — its shape moved');
	}

	return companies;
}
