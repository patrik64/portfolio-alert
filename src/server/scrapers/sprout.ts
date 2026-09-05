import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://sproutfund.vc/companies/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with divi. each company is a "blurb": a logo, a heading, and a
// paragraph that opens with the company's name linked to its site.
//
// the heading is what names the company, not the logo's alt text — the fund
// has copied cards to make new ones and left the old alt behind, so glowtify's
// logo still says Care2Talk and levr's says LetHub.
//
// one company carries "(Exited)" after its name. that comes out of the name
// and into the category, so the day the fund marks another one it does not
// read as a new company.

const BLURB = '<div class="et_pb_blurb_content">';
const NAME = /<h4 class="et_pb_module_header"><span>([\s\S]*?)<\/span><\/h4>/;
const DESCRIPTION = /<div class="et_pb_blurb_description">([\s\S]*?)<\/div>/;
const SITE = /<a href="(https?:\/\/[^"]+)"/;
const EXITED = /\s*\((?:exited|acquired)\)\s*$/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]+>/g, ''))
		.replace(/\s+/g, ' ')
		.trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const blurb of html.split(BLURB).slice(1)) {
		const headed = clean(blurb.match(NAME)?.[1] ?? '');
		const name = headed.replace(EXITED, '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: EXITED.test(headed) ? 'Exited' : '',
			url: blurb.match(DESCRIPTION)?.[1]?.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('sprout: no companies on the portfolio page');
	}

	return companies;
}
