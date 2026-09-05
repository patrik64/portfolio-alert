import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.vastvc.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// server-rendered wordpress: the portfolio is one <table class="toggle"> per
// sector, each opened by a <th class="t-heading"> heading and holding a row per
// company — logo cell, founders cell, then the overview cell (the only one
// wrapped in a <p>). the company name is nowhere in the markup as a field: the
// logo <img> has no alt, the logo filenames are frequently junk
// ("Screen-Shot-2023-12-01...", "icon16.png", "unnamed.png"), and the WP custom
// post types store the overview *as* the post title. every overview does open
// with the company's own name ("Bark offers dog lovers…", "Higher Ground
// Education aims to…"), so the name is the run of capitalised words the
// sentence starts with, up to the first lower-case word (the verb).
//
// the site links no company websites at all — the per-row anchor is a
// "http://bing.com" placeholder and the badge icons link "#" — so url stays ''.

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#8217;|&#39;/g, "'")
		.replace(/&#038;/g, '&')
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

const text = (s: string) => decode(s.replace(/<[^>]+>/g, ' '));

// "Quigo, an ad-targeting network, enables…" -> "Quigo";
// "SiteRx's software integrates…" -> "SiteRx";
// "Marble (formerly Medchart) is building…" -> "Marble"
function nameFrom(overview: string): string {
	const words: string[] = [];
	for (const word of overview.split(' ')) {
		if (!/^[A-Z0-9]/.test(word)) break;
		words.push(word);
	}
	return words
		.join(' ')
		.replace(/[,.;:]+$/, '')
		.replace(/['’]s$/, '');
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	for (const section of html.split('<th class="t-heading"><h4>').slice(1)) {
		// the heading wraps onto two lines with a <br>; the rows end at </table>,
		// which keeps the Elementor demo tables further down the page out
		const category = text(section.slice(0, section.indexOf('</h4>')));
		const end = section.indexOf('</table>');
		for (const [, cell] of section
			.slice(0, end === -1 ? undefined : end)
			.matchAll(/<td class="table-item">\s*<p>([\s\S]*?)<\/p>/g)) {
			const name = nameFrom(text(cell));
			if (name) companies.push({ name, category, url: '' });
		}
	}

	if (companies.length === 0) {
		throw new Error('vastvc: no companies on the page');
	}

	return companies;
}
