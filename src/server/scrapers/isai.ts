import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.isai.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace carrying the portfolio as a hand-written code block: a wall of
// logo boxes, each linking to the company's own address with the name in the
// logo's alt text, an EXITED word on the ones the fund is out of, and a
// badge naming which of the fund's vehicles came in — a vehicle rather than
// anything about the company, so it is not kept. the markup is loose about
// whitespace (href= "..."), so the patterns are too.

const BOX = 'logo-box';
const SITE = /href\s*=\s*"(https?:\/\/[^"]+)"/;
const NAME = /alt\s*=\s*"([^"]*)"/;
const STATUS = /class\s*=\s*"text status">\s*([^<]*)</;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

const capitalize = (s: string) =>
	s
		.split(' ')
		.filter(Boolean)
		.map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const box of html.split(BOX).slice(1)) {
		const name = capitalize(clean(box.match(NAME)?.[1] ?? ''));
		// the wall opens on the fund's own logo
		if (!name || /^isai$/i.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const exited = /exited/i.test(box.match(STATUS)?.[1] ?? '');
		companies.push({
			name,
			category: exited ? 'Exited' : '',
			url: box.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('isai: no companies on the portfolio page');
	}

	return companies;
}
