import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://cacao-capital.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a canva website: the html has no body to speak of, the whole site, every page of
// it, is a json string handed to a script. the portfolio page opens with a few
// companies shown large, a logo followed by a line of its sector, then a wall of
// logos, then columns of plain names in one text box each, the last under a heading
// of "SPV´s". so the names are read from the columns. the large logos carry no name,
// so those are looked up once, keyed by the logo's id, and the sector is the next
// text after it. the wall names nothing either and many of its logos can't be read
// as a name, some being funds, so it is passed over. no address is given anywhere.
const LOGOS: Record<string, string> = {
	MAGmP97dr9I: 'Ábaco',
	MAGmP39MH84: 'Cubo',
	MAGmPz9dUGs: 'Propi',
	MAGmP4gSUjk: 'Boxful',
	MAGmP048uxg: 'Sento',
	MAGmPxtw1yo: 'Pulster.ai',
	MAHGI2dYFCI: 'Influur'
};

const BOOTSTRAP = "window['bootstrap'] = JSON.parse('";
const PORTFOLIO_PAGE = 'Portfolio';
const COLUMNS_HEADING = /\(SPV/;
const ANY_HEADING = /driving the future/i;

// the columns' slips: a typo, a logo's file name, a company under its old name too
const FIXES: Record<string, string> = {
	'perplexity ai': 'Perplexity',
	'transitnet logo': 'TransitNet',
	'treggo (carryt)': 'Carryt'
};
// the fund's stakes in other funds, and a label that names no one
const NOT_COMPANIES = /^(?:y combinator fund|fox ventures\b.*|cryptoverse ventures|hedge fund)$/i;
// "Perfekto (YC S21)", "Valoreo (Razor G)", "Anfin*", "Morari, Inc."
const NOTE = /\s*\([^)]*\)$/;
const MARK = /\*+$/;
const LEGAL_FORM = /,?\s+(?:inc|llc|ltd|corp)\.?$/i;

const unescapes: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' };

// the string as the script would read it, up to its closing quote
function scriptString(html: string, from: number): string {
	let end = from;
	while (end < html.length && html[end] !== "'") end += html[end] === '\\' ? 2 : 1;
	return html
		.slice(from, end)
		.replace(/\\(x[0-9a-f]{2}|u[0-9a-f]{4}|[\s\S])/gi, (_, code: string) =>
			code.length > 1 ? String.fromCharCode(parseInt(code.slice(1), 16)) : (unescapes[code] ?? code)
		);
}

// every string under a node, in document order
function eachString(node: unknown, visit: (s: string) => void): void {
	if (typeof node === 'string') visit(node);
	else if (Array.isArray(node)) node.forEach((child) => eachString(child, visit));
	else if (node && typeof node === 'object') Object.values(node).forEach((child) => eachString(child, visit));
}

const nameOf = (line: string) => {
	const shown = line.replace(/\s+/g, ' ').trim();
	return (FIXES[shown.toLowerCase()] ?? shown.replace(MARK, '').replace(NOTE, '').replace(LEGAL_FORM, '')).trim();
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const at = html.indexOf(BOOTSTRAP);
	if (at < 0) {
		throw new Error('cacao: no site data in the page');
	}
	const site = JSON.parse(scriptString(html, at + BOOTSTRAP.length)) as {
		page?: { A?: { A?: { B?: string; t?: unknown[] }[] } };
	};
	const sections = site.page?.A?.A?.find((page) => page.B === PORTFOLIO_PAGE)?.t;
	if (!sections) {
		throw new Error('cacao: no portfolio page in the site data');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	const add = (name: string, category: string) => {
		if (!name || NOT_COMPANIES.test(name) || seen.has(name.toLowerCase())) return;
		seen.add(name.toLowerCase());
		companies.push({ name, category, url: '' });
	};

	let logo = '';
	let spv = false;
	for (const section of sections) {
		const hasColumns = COLUMNS_HEADING.test(JSON.stringify(section));
		eachString(section, (s) => {
			if (LOGOS[s]) logo = LOGOS[s];
			// text boxes, and nothing else here, end in a line break
			if (!s.endsWith('\n')) return;
			if (hasColumns) {
				if (ANY_HEADING.test(s)) spv = COLUMNS_HEADING.test(s);
				else for (const line of s.split('\n')) add(nameOf(line), spv ? 'SPV' : '');
			} else if (logo) {
				add(logo, s.trim().replace(/\s*,\s*/g, ' / '));
				logo = '';
			}
		});
	}

	// the columns are most of the page; without them the page has been rebuilt
	if (companies.length < 100) {
		throw new Error(`cacao: only ${companies.length} companies in the portfolio page's data`);
	}

	return companies;
}
