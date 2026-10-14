import type { ScrapedCompany } from './types';

const PAGE_URL =
	'https://research.massgeneralbrigham.org/en/researchers-and-collaborators/innovation/mass-general-brigham-ventures/investment-portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// adobe's edge delivery: the investment portfolio page is three grids, the
// whole of each in the page — the active companies, the exited ones and
// the ones taken public — a card a run of lines: its logo, its name, its
// site ("#" for many an exit), for an exit how it went ("Acquired by Roche
// (ADR: RHHBY) Oct. 2015", "IPO June 2020 (NASDAQ: AKUS); acquired by
// Lilly …") and a line about it. a company in more than one grid ("Verve
// Therapeutics", sold after its listing) is listed once with the tags of
// each. a sale is kept with its buyer and the Exited tag, a listing with
// the IPO tag.

const SECTION = /(?=<h2 id="[^"]*">)/;
const HEADING = /^<h2 id="[^"]*">([\s\S]*?)<\/h2>/;
const CARD = /<div>\s*<div>\s*((?:<p>[\s\S]*?<\/p>\s*)+)<\/div>\s*<\/div>/g;
const LINE = /<p>([\s\S]*?)<\/p>/g;
const HREF = /<a href="([^"]*)"/;
// "Acquired by Roche (ADR: RHHBY) Oct. 2015", "acquired by Lilly (NYSE: LLY) …"
const BUYER =
	/\bacquired by\s+(.+?)(?=\s*\(|\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(?:19|20)\d{2}|\s*[;,]|\s*$)/i;
const EXITED = /\bexited\b/i;
const IPO = /\bipos?\b/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#x26;/gi, '&')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// a line that is only an address: a logo's file, a site, or "#"
const bare = (text: string) => !text || text === '#' || /^https?:\/\/\S+$/i.test(text);

interface Entry {
	name: string;
	url: string;
	tags: string[];
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const entries = new Map<string, Entry>();
	for (const section of html.split(SECTION).slice(1)) {
		const heading = clean(section.match(HEADING)?.[1] ?? '');
		const exited = EXITED.test(heading);
		const listed = IPO.test(heading);
		for (const [, card] of section.matchAll(CARD)) {
			const lines = [...card.matchAll(LINE)].map(([, line]) => line);
			const texts = lines.map(clean);
			// the name is the first line that is not an address; the lines after it say how it went
			const at = texts.findIndex((text) => !bare(text));
			const name = at < 0 ? '' : texts[at];
			if (!name || STEALTH.test(name)) continue;
			const site = lines
				.slice(at + 1)
				.map((line) => unescape(line.match(HREF)?.[1] ?? '').trim())
				.find((href) => /^https?:\/\//i.test(href));
			const buyer = (exited || listed) && texts.slice(at + 1).join(' ').match(BUYER)?.[1];
			const key = name.toLowerCase();
			const entry: Entry = entries.get(key) ?? { name, url: '', tags: [] };
			entry.url ||= site ?? '';
			entry.tags.push(listed ? 'IPO' : '', buyer ? `Acquired by ${tag(buyer)}` : '', exited || buyer ? 'Exited' : '');
			entries.set(key, entry);
		}
	}

	const companies: ScrapedCompany[] = [...entries.values()].map(({ name, url, tags }) => ({
		name,
		category: tags.filter((t, i, all) => t && all.indexOf(t) === i).join(', '),
		url: url || PAGE_URL
	}));

	if (companies.length === 0) {
		throw new Error('mgbventures: no companies on the investment portfolio page — the markup moved');
	}
	if (!companies.some(({ url }) => url !== PAGE_URL)) {
		throw new Error("mgbventures: no company links its site — the cards' markup moved");
	}

	return companies;
}
