import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.theartemisfund.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// gatsby over strapi, but the logo grid's contents are not in the page data —
// only its styling is. the logos themselves are in the html, each company
// appearing twice, once in colour and once in blue, and the two are described
// differently ("goodmylk" against "good mylk co", "hellodivorce" against
// "hello divorce").
//
// so the pictures are grouped by the file they came from, once the number the
// fund ordered them by and the colour they are in come off, and the fuller of
// the two descriptions names the company. where the fund never described a
// picture, the filename does.
//
// the fund links no company to its own site, and marks no sectors or exits.

const IMAGE = /<img[^>]*>/g;
const SRC = /src="(https:\/\/morphic-images[^"]*)"/;
const ALT = /alt="([^"]*)"/;
// only the company logos come in two colours; the page's furniture does not
const COLOURED = /_(blue|colou?r)_/;
const PLACEHOLDER = /type a description/i;

const capitalize = (s: string) =>
	s
		.split(' ')
		.map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const byFile = new Map<string, string[]>();
	for (const [tag] of html.matchAll(IMAGE)) {
		const src = tag.match(SRC)?.[1];
		if (!src) continue;
		const file = src.split('/').pop()?.split('?')[0] ?? '';
		if (!COLOURED.test(file)) continue;
		const stem = file
			.replace(/^\d+_/, '')
			.replace(/_(blue|colou?r)(_\d)?_[0-9a-f]+\.\w+$/i, '');
		byFile.set(stem, [...(byFile.get(stem) ?? []), (tag.match(ALT)?.[1] ?? '').trim()]);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [stem, alts] of byFile) {
		const described = alts
			.filter((alt) => alt && !PLACEHOLDER.test(alt))
			// the fuller description, and among equals the one that kept its capitals
			.sort(
				(a, b) =>
					a.length - b.length ||
					[...a].filter((c) => c >= 'A' && c <= 'Z').length -
						[...b].filter((c) => c >= 'A' && c <= 'Z').length
			);
		const name = capitalize(described.at(-1) ?? stem.replace(/_/g, ' '));
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({ name, category: '', url: '' });
	}

	if (companies.length === 0) {
		throw new Error('artemis: no company logos on the portfolio page');
	}

	return companies;
}
