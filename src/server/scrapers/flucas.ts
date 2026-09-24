import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.flucasvc.com/portfolio';
// the share of the sector headings' own counts the lists must add up to
const MIN_SHARE = 0.9;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace, the portfolio written out as text: a "weekly spotlight" of a
// few companies, then "By Sector", each sector a line with its count
// ("Fintech and Insurtech (33)") over a bulleted list of names, most linked
// to the company's site. only the sectors are read, the spotlight repeating
// companies from them. a note in brackets after a name says how the fund got
// out — "(Exit - Acq'd by Capital One)", "(Exit - NASDAQ: HUT)" — or, under
// the emerging markets, where a company is ("Oxio (Canada)"). a company
// still in stealth is a line saying so, and is left out.

const START = 'By Sector';
const BLOCK = /<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/g;
const SECTOR = /^(.+?)\s*\((\d+)\)$/;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/;
const NOTE = /\(([^()]*)\)/g;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;|&rsquo;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// "Exit - Acq'd by Capital One" -> "Acquired by Capital One"
const outcome = (note: string) =>
	tag(
		note
			.replace(/^exit\s*-\s*/i, '')
			.replace(/^acq['’]?d\b/i, 'Acquired')
			.replace(/^acquired/i, 'Acquired')
	);

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const start = html.indexOf(START);
	if (start < 0) {
		throw new Error('flucas: the portfolio page has no "By Sector" list — the layout moved');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let sector = '';
	let stated = 0;
	let listed = 0;
	for (const [, kind, body] of html.slice(start).matchAll(BLOCK)) {
		const text = clean(body);
		if (!text) continue;
		if (kind === 'p') {
			const heading = text.match(SECTOR);
			if (heading && !LINK.test(body)) {
				sector = tag(heading[1]);
				stated += Number(heading[2]);
			}
			continue;
		}
		if (!sector) continue;
		listed++;
		const link = body.match(LINK);
		const notes = [...text.matchAll(NOTE)].map((m) => m[1].trim());
		const name = clean(link?.[2] ?? text.replace(NOTE, ' ')).replace(NOTE, ' ').trim();
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const exits = notes.filter((n) => /^exit\b|acquired|acq['’]?d/i.test(n));
		companies.push({
			name,
			category: [
				sector,
				...notes.filter((n) => !exits.includes(n)).map(tag),
				...exits.map(outcome),
				exits.length ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: unescape(link?.[1] ?? '')
		});
	}

	if (stated > 0 && listed < stated * MIN_SHARE) {
		throw new Error(`flucas: the sectors list ${listed} of the ${stated} companies they count`);
	}
	if (companies.length === 0) {
		throw new Error('flucas: no companies on the portfolio page');
	}

	return companies;
}
