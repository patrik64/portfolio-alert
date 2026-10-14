import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.quantonation.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js, since the wordpress site and its api went in october 2026: the
// portfolio page draws its grid in the browser from one list in react's
// payload, a company each, giving its name, its theme ("computing",
// "materials + energy"), its stage ("seed", "series b+", "listed",
// "exited"), its countries and the fund it was backed from ("qi", "qii"),
// all in lower case for the page to set in capitals. the theme, the stage,
// the countries and the fund are kept as tags; a listing as IPO and an exit
// each with the Exited tag. the list gives no company's site, so a company
// links its page here.
//
// the payload arrives as a run of javascript string literals that have to
// be unescaped and joined before the json inside them can be read.

// the companies stored under the names the old site gave them, which the
// new one has changed: a moved name would read as a newcomer
const STORED_AS: Record<string, string> = {
	Chiral: 'Chiral Nano',
	'Foqus Technologies': 'Foqus',
	'KETS Quantum Security': 'Kets',
	'PINC Technologies': 'Pinc',
	'Pioniq Technologies': 'Pioniq',
	'Project Eleven': 'Project 11',
	Quobly: 'Quobly (former Siquance)',
	Sensorium: 'Sensorium Tech Lab'
};

const CHUNK = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
const LIST = '"companies":[{"companyName":';
const LISTED = /^listed$/i;
const EXITED = /^exited$/i;
// the funds, "qi" to "qiii", are written in capitals
const FUND = /^q[iv]+$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Company {
	companyName?: string;
	slug?: string;
	theme?: string;
	stage?: string;
	location?: string[];
	fund?: string;
	draft?: boolean;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// "materials + energy" -> "Materials + Energy", "pre-seed" -> "Pre-Seed"
const titled = (s: string) => tag(s).replace(/\b\w/g, (c) => c.toUpperCase());

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

// a stage as tags: a listing and an exit are ways out
function stageOf(stage: string): string[] {
	if (LISTED.test(stage)) return ['IPO', 'Exited'];
	if (EXITED.test(stage)) return ['Exited'];
	return [titled(stage)];
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const payload = [...html.matchAll(CHUNK)].map(([, literal]) => JSON.parse(literal) as string).join('');
	const at = payload.indexOf(LIST);
	const list = at < 0 ? undefined : jsonAt(payload, at + LIST.indexOf('['));
	if (!Array.isArray(list)) {
		throw new Error("quantonation: the page's payload carries no portfolio list — the page moved");
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const company of list as Company[]) {
		const written = clean(company.companyName ?? '');
		if (!written || company.draft || STEALTH.test(written)) continue;
		const name = STORED_AS[written] ?? written;
		if (seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const fund = clean(company.fund ?? '');
		companies.push({
			name,
			category: [
				titled(company.theme ?? ''),
				...stageOf(clean(company.stage ?? '')),
				...(company.location ?? []).map(titled),
				FUND.test(fund) ? fund.toUpperCase() : titled(fund)
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: company.slug ? `${PAGE_URL}/${encodeURIComponent(company.slug)}` : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('quantonation: the portfolio list names no companies');
	}

	return companies;
}
