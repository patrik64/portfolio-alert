import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://outlander.vc/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress on the fund's own theme. the portfolio is a custom post type, but
// the rest api holds only the names — where the company can be found is not in
// it, and neither is anything else worth having. the theme instead writes the
// whole portfolio into the page as json and lets the browser filter it, so
// that is what is read.
//
// the page opens on Fund III and the other two are a click away, so reading
// the array rather than what is drawn keeps all three.
//
// the only thing the fund files a company under is which of its three funds
// bought in. that is the fund's own vehicle rather than anything about the
// company, so it is left out, and most companies are left with no category at
// all. the eight it says more about, it says under the logo on hover, and what
// it says there is always how the company left.

const ARRAY = /\blet\s+data\s*=\s*\[/;

interface Entry {
	title?: string;
	hover_content?: string;
	Link?: string;
}

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

const clean = (s: string) => un(s).replace(/\s+/g, ' ').trim();

// the fund writes an exit as a phrase rather than a label — "acquired by
// Appfolio", "via Breaker" — so it is given a capital to read as the tag it
// becomes. the category is comma-joined, so a comma in it would read as two
const tag = (s: string) =>
	clean(s)
		.replace(/\s*,\s*/g, ' / ')
		.replace(/^[a-z]/, (c) => c.toUpperCase());

// the array is cut out by counting brackets, so that a bracket inside a name
// or a link cannot end it early
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

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const at = html.search(ARRAY);
	const opens = at === -1 ? -1 : html.indexOf('[', at);
	const literal = opens === -1 ? '' : arrayAt(html, opens);
	if (!literal) {
		throw new Error('outlander: the portfolio is no longer written into the page');
	}

	let entries: Entry[];
	try {
		entries = JSON.parse(literal) as Entry[];
	} catch {
		throw new Error('outlander: the portfolio came back in a shape that could not be read');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const entry of entries) {
		const name = clean(entry.title ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: tag(entry.hover_content ?? ''),
			url: clean(entry.Link ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('outlander: no companies in the portfolio');
	}

	return companies;
}
