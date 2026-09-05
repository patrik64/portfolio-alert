import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.renewalfunds.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 10;

// wordpress with a divi project grid; divi keeps its projects out of the rest
// api, so the grid is read from the page. the tiles carry the company's name
// and a link to the fund's own write-up, and little else — the terms in their
// class lists are the vehicle holding the company and a flag for what the
// front page shows.
//
// the write-ups are where the fund says something: an industry, a town, and
// the company's address. they are fetched in batches.
//
// a page's body links out to whatever it mentions, so the address is taken
// from the one link whose text is a bare domain — the fund writes the
// company's own out that way, and its prose links ("Ocean Wise") never look
// like that. one company has no link at all.
//
// nine companies carry "(Exited)" in the name. that is how the investment
// ended rather than what the company is called, so it moves to the category.

const ITEM = /<a href="(https:\/\/www\.renewalfunds\.com\/project\/[^"]*)" title="([^"]*)"/g;
const FIELD = (heading: string) => new RegExp(`<h3>${heading}</h3>\\s*<p>([^<]*)</p>`, 'i');
const ANCHOR = /<a href="(https?:\/\/[^"]+)"[^>]*>([^<]*)<\/a>/g;
// an anchor labelled with nothing but a domain is the company's own address
const BARE_DOMAIN = /^(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\/?$/i;
const EXITED = /\s*\(\s*exited\s*\)\s*$/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a town written "Vancouver, BC" would read
// as two tags rather than one place
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);

	// the fund lists two of its companies twice
	const listed: { name: string; exited: boolean; page: string }[] = [];
	const seen = new Set<string>();
	for (const m of html.matchAll(ITEM)) {
		const listedName = clean(m[2]);
		const name = clean(listedName.replace(EXITED, ''));
		if (!name || seen.has(name)) continue;
		seen.add(name);
		listed.push({ name, exited: EXITED.test(listedName), page: m[1] });
	}

	if (listed.length === 0) {
		throw new Error('renewal: no companies on the portfolio page');
	}

	const companies: ScrapedCompany[] = [];
	for (let i = 0; i < listed.length; i += BATCH_SIZE) {
		const batch = listed.slice(i, i + BATCH_SIZE);
		const pages = await Promise.all(batch.map((c) => fetchText(c.page).catch(() => '')));
		batch.forEach((c, j) => {
			const page = pages[j];
			const site = [...page.matchAll(ANCHOR)].find((m) => BARE_DOMAIN.test(m[2].trim()));
			companies.push({
				name: c.name,
				category: [
					tag(page.match(FIELD('Industry'))?.[1] ?? ''),
					tag(page.match(FIELD('Location'))?.[1] ?? ''),
					c.exited ? 'Exited' : ''
				]
					.filter(Boolean)
					.join(', '),
				url: site?.[1] ?? ''
			});
		});
	}

	return companies;
}
