import type { ScrapedCompany } from './types';

const BASE_URL = 'https://palmdrive.vc';
const DATA_URL = `${BASE_URL}/assets/portfolio-data.js`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a vue app over a static data file. the portfolio page ships an empty
// template and one script, and that script is the whole portfolio written out
// as a literal — name, a line about the company, its site, its industry and
// the region it is in.
//
// the file is javascript rather than json, but the array under `items` is
// plain json, so it is cut out and parsed rather than run.
//
// the fund groups companies by what they are worth: over five billion, one to
// five, and under one. the top two tiers are kept as a tag, the way a unicorn
// badge is elsewhere; the third is where everything else sits and says
// nothing, so it is dropped.

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a tag written with a comma in it would read
// as two rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// the tiers are written with a full-width plus and a lowercase b, which is how
// they set on the page rather than anything about the company
const TIERS: [RegExp, string][] = [
	[/^[+＋]\s*5b$/i, '$5B+'],
	[/^[+＋]\s*1b\s*~\s*5b$/i, '$1B–5B']
];
const worth = (tier: string) => TIERS.find(([shape]) => shape.test(clean(tier)))?.[1] ?? '';

// the page runs the same rule over a link before it follows it: the two
// placeholders it knows about become nothing, and a bare domain is assumed to
// be https
const EMPTY = /^(?:javascript:;?|#)?$/i;
const site = (url: string) => {
	const written = clean(url);
	if (EMPTY.test(written)) return '';
	return /^https?:\/\//i.test(written) ? written : `https://${written}`;
};

// the array is cut out by counting brackets, so that a comma or a bracket
// inside a company's description cannot end it early
const arrayAt = (source: string, from: number) => {
	let depth = 0;
	let inString = false;
	for (let at = from; at < source.length; at++) {
		const char = source[at];
		if (inString) {
			if (char === '\\') at++;
			else if (char === '"') inString = false;
			continue;
		}
		if (char === '"') inString = true;
		else if (char === '[') depth++;
		else if (char === ']' && --depth === 0) return source.slice(from, at + 1);
	}
	return '';
};

interface Item {
	Title?: string;
	Url?: string | null;
	Industry?: { Value?: string }[];
	Region?: { Value?: string }[];
}

interface Group {
	Category?: string;
	Item?: Item[];
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(DATA_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${DATA_URL}: ${resp.status}`);
	}
	const source = await resp.text();

	const opens = source.indexOf('[', source.search(/\bitems\s*:/));
	const literal = opens === -1 ? '' : arrayAt(source, opens);
	if (!literal) {
		throw new Error('palmdrive: the portfolio is no longer written into the data file');
	}

	let groups: Group[];
	try {
		groups = JSON.parse(literal) as Group[];
	} catch {
		throw new Error('palmdrive: the portfolio came back in a shape that could not be read');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const group of groups) {
		const tier = worth(group.Category ?? '');
		for (const item of group.Item ?? []) {
			const name = clean(item.Title ?? '');
			if (!name || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());

			companies.push({
				name,
				category: [
					...(item.Industry ?? []).map((i) => tag(i.Value ?? '')),
					...(item.Region ?? []).map((r) => tag(r.Value ?? '')),
					tier
				]
					.filter(Boolean)
					.join(', '),
				url: site(item.Url ?? '')
			});
		}
	}

	if (companies.length === 0) {
		throw new Error('palmdrive: no companies in the portfolio');
	}

	return companies;
}
