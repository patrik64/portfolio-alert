import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.dreamit.com/portfolio-securetech';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace, laid out on its fluid grid: the securetech portfolio page
// (the fund's healthtech and urbantech pages are built otherwise and not
// read) sets out its companies as text blocks — a heading naming one and
// linking its site, a line with where it is ("Cupertino, CA") beside it,
// and a paragraph about it below, which on one sold says "acquired by
// Cisco". the blocks come in no reading order, each placed by a grid area
// in the page's styles, so every line and paragraph is given to the name
// nearest above it on the grid. a name repeated in the featured row above
// is kept once.

const SECTION = /(?=<div data-fluid-engine="true">)/;
const AREA = /\.fe-block-([\w-]+)\s*\{\s*grid-area:\s*(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)/g;
const BLOCK = /(?=<div class="fe-block fe-block-)/;
const BLOCK_ID = /^<div class="fe-block fe-block-([\w-]+)"/;
const NAME = /<h\d[^>]*>\s*<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h\d>/;
const PLACE = /^[^.,]{2,40},\s*[A-Za-z .]{2,30}$/;
const OUTCOME = /\b(acquired by [^.;,()]+|merged with [^.;,()]+|went public|ipo)/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) =>
	unescape(s.replace(/<(script|style)\b[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a place written "Cupertino, CA" would
// read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

interface Card {
	name: string;
	url: string;
	row: number;
	place: string;
	outcome: string;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));

	const cards: Card[] = [];
	const seen = new Set<string>();
	for (const section of main.split(SECTION).slice(1)) {
		// each block is placed twice, for phones and then for wider screens;
		// the last placing is the one read
		const rows = new Map<string, number>();
		for (const [, id, row] of section.matchAll(AREA)) rows.set(id, Number(row));
		const named: Card[] = [];
		const details: { row: number; text: string }[] = [];
		for (const block of section.split(BLOCK).slice(1)) {
			const row = rows.get(block.match(BLOCK_ID)?.[1] ?? '');
			if (row === undefined || !block.includes('sqs-block-html')) continue;
			const heading = block.match(NAME);
			const name = heading ? clean(heading[2]) : '';
			if (heading && name && name.length < 60) {
				if (STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
				seen.add(name.toLowerCase());
				named.push({ name, url: unescape(heading[1]).trim(), row, place: '', outcome: '' });
			} else {
				details.push({ row, text: clean(block) });
			}
		}
		for (const detail of details) {
			const card = named.filter((c) => c.row <= detail.row).sort((a, b) => b.row - a.row)[0];
			if (!card || !detail.text) continue;
			if (PLACE.test(detail.text)) card.place = tag(detail.text);
			else card.outcome ||= detail.text.match(OUTCOME)?.[1] ?? '';
		}
		cards.push(...named);
	}

	const companies: ScrapedCompany[] = cards.map(({ name, url, place, outcome }) => ({
		name,
		category: [place, outcome ? tag(outcome[0].toUpperCase() + outcome.slice(1)) : '', outcome ? 'Exited' : '']
			.filter(Boolean)
			.join(', '),
		url: url || PAGE_URL
	}));

	if (companies.length === 0) {
		throw new Error('dreamit: no companies on the securetech portfolio page');
	}

	return companies;
}
