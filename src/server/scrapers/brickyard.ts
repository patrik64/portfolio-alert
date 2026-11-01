import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.justlaybrick.com/portcos';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: one numbered text list under a heading per fund, "Pilot Fund", "Fund
// I" and so on. a line is a number, the name, linked to its site, a dash and a few
// words on what it does with the month it joined ("5.21"), or a brick and who bought
// it ("🧱 Acquired by NVIDIA"), or a skull, which the page's key reads as "KIA". the
// companies not yet announced are all named "Stealth", so they are passed over.
const SECTION_START = 'Pilot Fund';
const SECTION_END = 'Hailing from';
const TOKEN = /<h3\b[^>]*>([\s\S]*?)<\/h3>|<p\b[^>]*>([\s\S]*?)<\/p>/g;
const LINE = /^\s*\d+\s+(?:<a\b[^>]*\bhref="([^"]*)"[^>]*>)?([\s\S]*?)(?:<\/a>)?\s*[—–]\s*([\s\S]*)$/;
const BOUGHT = /acquired by\s+(.+?)\s*$/i;
const SKULL = /☠/;
const MONTH = /\b\d{1,2}\.(\d{2})\s*$/;
const STEALTH = /^stealth$/i;

const clean = (s: string) =>
	s
		.replace(/<[^>]*>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&#0?39;|&rsquo;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => s.replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const start = html.indexOf(SECTION_START);
	const section = start < 0 ? '' : html.slice(html.lastIndexOf('<h3', start)).split(SECTION_END)[0];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let fund = '';
	for (const [, heading, paragraph] of section.matchAll(TOKEN)) {
		if (heading !== undefined) {
			fund = tag(clean(heading));
			continue;
		}
		const [, href = '', shown = '', rest = ''] = paragraph.match(LINE) ?? [];
		const name = clean(shown);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const words = clean(rest);
		const buyer = words.match(BOUGHT)?.[1];
		const dead = SKULL.test(words);
		const year = words.match(MONTH)?.[1];
		companies.push({
			name,
			category: [
				fund,
				year ? `20${year}` : '',
				buyer ? `Acquired by ${tag(buyer)}` : '',
				dead ? 'Shut Down' : '',
				buyer || dead ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			// a few were pasted with their tracking parameters
			url: /^https?:\/\//.test(href) ? href.split('?')[0] : ''
		});
	}

	if (companies.length === 0) {
		throw new Error('brickyard: no companies on the portfolio page');
	}

	return companies;
}
