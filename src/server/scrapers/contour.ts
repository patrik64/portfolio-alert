import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.contourventures.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with elementor, the tiles written by hand: each column of the
// portfolio grid holds a logo that opens a popup — the logo again, linked
// to the company, over a paragraph about it. a column classed as exited
// wears an "EXITED" corner, or "PARTIAL EXIT" where the fund has sold only
// part of its stake, and the paragraph of an exit mostly ends on how it
// came ("In July 2016, the company was acquired by Monotype."). a few
// columns lack the grid's classes altogether, and hold companies like the
// rest.
//
// no name is set apart anywhere, but a popup's id is its company's name
// run together ("movableink"), and the paragraph spells it out: the words
// there that make up the id are the name as the fund writes it ("Movable
// Ink", "Simpli.fi", "yhat"). the few ids that are not their companies'
// names are listed here, and one the paragraph does not spell falls back to
// what its logo's file is called. the links are kept as the fund has them —
// for some old exits the buyer's site, or the news of the sale. one tile is
// a programme the fund takes part in (the FinTech Innovation Lab), not a
// company it holds, and is left out.
const NAMES: Record<string, string> = {
	felixpago: 'Felix',
	octanelending: 'Octane',
	sigma: 'Sigma360',
	wave: 'WAVE BL'
};
const PROGRAMMES = new Set(['fintech']);

const COLUMN = /(?=<div\b[^>]*\bclass="(?:[^"]*\s)?elementor-column[\s"])/;
const OPENER = /<a\b[^>]*\bclass="(?:[^"]*\s)?wp-colorbox-inline[\s"][^>]*>\s*<img\b[^>]*\bsrc="([^"]*)"/;
const ID = /\bhref="#([^"]+)"/;
const POPUP = /<div\b[^>]*\bclass="(?:[^"]*\s)?portfolio-popup[\s"][^>]*>([\s\S]*?)<\/div>/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
const PARAGRAPH = /<p\b[^>]*>([\s\S]*?)<\/p>/g;
// "acquired by the private equity firm GTCR.", "acquired by Yahoo (NASDAQ:
// YHOO).", "acquired by Fits.me. In July 2015, ..."
const BUYER = /\bacquired by (?:the )?(?:private equity firm,? )?([^,(]+?)(?=\s*\(|,|\.(?:\s|$)|$)/i;
const LISTED = /\bwent public\b|\bIPO\b/;

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

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// the words of a paragraph that run together into a popup's id
function spelled(id: string, text: string): string {
	const want = key(id);
	const words = text.split(' ');
	for (let i = 0; want && i < words.length; i++) {
		let run = '';
		for (let j = i; j < words.length; j++) {
			run += key(words[j]);
			if (!run || !want.startsWith(run)) break;
			if (run === want) {
				return words
					.slice(i, j + 1)
					.join(' ')
					.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
			}
		}
	}
	return '';
}

// "machinery-partner.png" -> "Machinery Partner"
const fileName = (src: string) =>
	decodeURIComponent(src.split('/').pop() ?? '')
		.replace(/\.\w+$/, '')
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const column of html.split(COLUMN).slice(1)) {
		const opener = column.match(OPENER);
		const id = opener?.[0].match(ID)?.[1] ?? '';
		if (!opener || !id || PROGRAMMES.has(id)) continue;
		const popup = column.match(POPUP)?.[1] ?? '';
		const text = [...popup.matchAll(PARAGRAPH)].map(([, paragraph]) => clean(paragraph)).join(' ');
		const name = NAMES[id] ?? (spelled(id, text) || fileName(opener[1]));
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const classes = column.slice(0, column.indexOf('>'));
		const partial = /\bportfolio-box-exited-partial\b/.test(classes);
		const exited = !partial && /\bportfolio-box-exited\b/.test(classes);
		const buyer = tag(text.match(BUYER)?.[1] ?? '');
		const site = unescape(popup.match(LINK)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				exited && buyer ? `Acquired by ${buyer}` : '',
				exited && !buyer && LISTED.test(text) ? 'IPO' : '',
				exited ? 'Exited' : '',
				partial ? 'Partial Exit' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('contour: no companies on the portfolio page');
	}

	return companies;
}
