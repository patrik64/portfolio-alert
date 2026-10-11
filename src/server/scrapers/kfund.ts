import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.kfund.vc/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js: the home page is the portfolio, every company the fund has
// backed in three lists — "Featured investments", "More investments" and,
// struck through, "We tried" — each a name linking its site, with the year
// beside it, and an exit with an arrow to its buyer ("→ Okta"). the page
// draws them from one list in react's payload, where a company's record
// gives its name, its site, the year, whether it is featured, its buyer
// ("exited_to") and whether it is dead. the year is kept as "Invested
// 2020", the buyer with the Exited tag, and a company that did not make it
// with the Closed tag.
//
// the payload arrives as a run of javascript string literals that have to
// be unescaped and joined before the json inside them can be read.

const CHUNK = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
const COMPANIES = '"companies":[{"name":';
const STEALTH = /^stealth\b/i;

interface Company {
	name?: string;
	url?: string;
	year?: number | string;
	exited_to?: string;
	dead?: boolean;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// the json value opening at start — an object or an array — up to its close
function jsonAt(text: string, start: number): unknown {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < text.length; i++) {
		const c = text[i];
		if (escaped) escaped = false;
		else if (c === '\\') escaped = true;
		else if (c === '"') inString = !inString;
		else if (!inString) {
			if (c === '{' || c === '[') depth++;
			else if ((c === '}' || c === ']') && --depth === 0) {
				try {
					return JSON.parse(text.slice(start, i + 1));
				} catch {
					return undefined;
				}
			}
		}
	}
	return undefined;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const payload = [...html.matchAll(CHUNK)].map(([, literal]) => JSON.parse(literal) as string).join('');
	const at = payload.indexOf(COMPANIES);
	const records = at < 0 ? undefined : jsonAt(payload, at + COMPANIES.indexOf('['));
	if (!Array.isArray(records)) {
		throw new Error("kfund: the page's payload carries no company list — the page moved");
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const record of records as Company[]) {
		const name = clean(record.name ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const year = String(record.year ?? '').match(/\b(?:19|20)\d{2}\b/)?.[0];
		const buyer = clean(record.exited_to ?? '');
		const site = clean(record.url ?? '');
		companies.push({
			name,
			category: [
				year ? `Invested ${year}` : '',
				buyer ? `Acquired by ${tag(buyer)}` : '',
				buyer ? 'Exited' : '',
				record.dead ? 'Closed' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error("kfund: the page's company list is empty");
	}

	return companies;
}
