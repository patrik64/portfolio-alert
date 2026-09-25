import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://eoventures.com/portfolio-all';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer, rendered on the server: the "all companies" page (the link the
// fund shows opens a "featured" page of six) folds every company into a card
// naming it, with a line about it and, on one sold, "(Acquired by Paper)" —
// and no site. but the page hands its data to the browser in a script of its
// own: the whole collection as one flat array that objects point into by
// index, a record per company under the hashed ids of its fields — the name,
// a category ("Fintech"), the founders, a location, the site and that note.
// the records are read from there; a company without a site links to the
// page.

const HANDOVER = /<script type="framer\/handover" id="__framer__handoverData">([\s\S]*?)<\/script>/;
// the fields, by the ids the site gives them
const FIELD = {
	name: 'YGSfiHict',
	category: 'MWqPd4uic',
	location: 'kL_QsVLGx',
	site: 'dx1tUH56y',
	note: 'HyCWjabS3'
} as const;
const OUTCOME = /^(acquired|merged|exited|ipo)\b/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two;
// the note comes in brackets
const tag = (s: string) =>
	clean(s)
		.replace(/^\(\s*|\s*\)$/g, '')
		.replace(/\s*,\s*/g, ' / ');

type Entry = unknown;

// a field points at an entry, and a text or link entry at the string holding
// it; anything else reads as nothing
function text(data: Entry[], at: Entry): string {
	const entry = typeof at === 'number' ? data[at] : at;
	if (typeof entry === 'string') return entry;
	if (entry && typeof entry === 'object' && !Array.isArray(entry) && 'value' in entry) {
		return text(data, (entry as { value: Entry }).value);
	}
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const handover = html.match(HANDOVER)?.[1];
	if (!handover) {
		throw new Error('eoventures: the page hands over no data');
	}
	const data = JSON.parse(handover) as Entry[];
	const records = data.filter(
		(entry): entry is Record<string, Entry> =>
			!!entry && typeof entry === 'object' && !Array.isArray(entry) && FIELD.name in entry && 'id' in entry
	);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const record of records) {
		const name = clean(text(data, record[FIELD.name]));
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const note = tag(text(data, record[FIELD.note]));
		companies.push({
			name,
			category: [
				tag(text(data, record[FIELD.category])),
				tag(text(data, record[FIELD.location])),
				note,
				OUTCOME.test(note) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: clean(text(data, record[FIELD.site])) || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('eoventures: no companies in the data the page hands over');
	}

	return companies;
}
