import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://jumpstartnova.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with divi: the portfolio page is a grid gallery, the whole of it
// in the page, an item a company — its logo linking its site, its name over
// a few lines about it, and its founders with their titles beside it. the
// logos' alt text is not to be trusted ("Drugviu" over Intus Care's,
// "Cellevolve" over SoHookd's), so the name is the heading over the lines;
// a carousel above repeats the companies and is passed over. the fund does
// not say which companies it is out of, and gives nothing to tag.

const ITEM = /(?=<div class="wonderplugin-gridgallery-item")/;
const SITE = /class="et_pb_module et_pb_image[^"]*portfolio-logo-image[^"]*">\s*<a href="([^"]*)"/;
const NAME = /portfolio-item-text[^"]*">\s*<div class="et_pb_text_inner">\s*<h6\b[^>]*>([\s\S]*?)<\/h6>/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unescape(item.match(SITE)?.[1] ?? '').trim();
		if (/^https?:\/\//i.test(site)) withSite++;
		companies.push({
			name,
			category: '',
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('jumpstartnova: no companies in the portfolio gallery — the markup moved');
	}
	if (withSite === 0) {
		throw new Error("jumpstartnova: no company's logo links its site — the gallery's markup moved");
	}

	return companies;
}
