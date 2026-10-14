import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.tenity.com/portfolio/';
// the portfolio the page draws, as the page asks its site for it
const DATA_URL = 'https://www.tenity.com/wp-json/tenity/v1/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress over airtable: the portfolio page draws its grid in the browser
// from a list its site serves, the whole of it at once, a company each with
// its name, its site, its country, its verticals ("Payments", "Crypto &
// Web3") and its stage ("Pre-Seed", "Series A") or "Exit". a name is the
// company's registered one as often as not ("Circular Unite Pte Ltd",
// "AAZZUR Inc I") or carries a note in brackets ("Aduno Pay (prev.
// Checksum)", "Automated Data Inc. (ADI)"); the legal form and the note are
// not part of it. the verticals, the country and the stage are kept as
// tags, an exit with the Exited tag.

const NOTE = /\s*\([^()]*\)\s*$/;
const FORM = /[\s,]+(?:inc\.?(?:\s+i+)?|llc|ltd\.?|limited|corp\.?|ag|gmbh|pte\.?|aps|ehf|wll|oü)$/i;
const EXIT = /^exit(?:ed)?$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Item {
	Name?: string;
	Website?: string;
	Country?: string | string[];
	Vertical?: string[];
	Stage?: string;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const list = (value: string | string[] | undefined) => (Array.isArray(value) ? value : [value ?? '']);

// "Circular Unite Pte Ltd" -> "Circular Unite", "Aduno Pay (prev. Checksum)" -> "Aduno Pay"
function nameOf(written: string): string {
	let name = written;
	for (let before = ''; before !== name; ) {
		before = name;
		name = name.replace(NOTE, '').replace(FORM, '').trim();
	}
	return name || written;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(DATA_URL, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${DATA_URL}: ${resp.status}`);
	}
	const data = await resp.json();
	const items: Item[] = data?.items ?? data?.records ?? [];
	if (items.length === 0) {
		throw new Error("tenity: the page's list carries no portfolio — the endpoint moved");
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		const name = nameOf(clean(item?.Name ?? ''));
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const stage = clean(item.Stage ?? '');
		// a bare address is a site too: "3pm.earth", "www.aona.ai"
		const site = clean(item.Website ?? '').replace(/^(?!https?:\/\/)(?=[\w-]+(?:\.[\w-]+)+(?:[/?#]|$))/i, 'https://');
		companies.push({
			name,
			category: [
				...list(item.Vertical).map(tag),
				...list(item.Country).map(tag),
				EXIT.test(stage) ? 'Exited' : tag(stage)
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('tenity: the portfolio names no companies');
	}

	return companies;
}
