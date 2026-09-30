import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://breakout.vc/portfolio';
const CMS_URL = 'https://breakout-ventures.cdn.prismic.io/api/v2';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js, the portfolio page served whole: a company is an entry linking
// its site, with its name and a line about it, and the ones the fund is out
// of carry " • EXITED" after the name and, at the end of the line, how it
// went between asterisks ("*Acquired by Halozyme (HALO)*", "*IPO 2019*").
//
// the page prints every name in capitals — "ZYMOCHEM", "STRM.BIO" — though
// the fund types them in its own case in the content the site is built
// from, a prismic repository anyone may read. so each name takes the
// fund's spelling from there where the letters agree ("ZymoChem"), and
// keeps the page's capitals where they do not, or where the repository
// cannot be had. the fund spells a few two ways in different places
// ("Zymochem"); the spelling that kept more of its capitals is taken.

const ENTRY = /(?=<li\b[^>]*\bclass="company_entry__)/;
const HREF = /<a\b[^>]*\bhref="([^"]*)"/;
const NAME = /class="company_entryName__[\w-]+"[^>]*>([\s\S]*?)<\/div>/;
const LINE = /class="company_entryDescription__[\w-]+"[^>]*>([\s\S]*?)<\/div>/;
const EXITED = /\s*•\s*exited\s*$/i;
const OUTCOME = /\*([^*]+)\*\s*$/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const capitals = (s: string) => (s.match(/\p{Lu}/gu) ?? []).length;
const shouted = (s: string) => s === s.toUpperCase();

// every name the site's pages hold in the repository, as the fund typed
// them: the companies' among them, and the team's, which spell nothing on
// the portfolio page
async function spellings(): Promise<string[]> {
	const api = await fetch(CMS_URL, { headers: { 'User-Agent': UA } });
	if (!api.ok) return [];
	const { refs } = (await api.json()) as { refs?: { ref: string; isMasterRef?: boolean }[] };
	const ref = refs?.find((r) => r.isMasterRef)?.ref;
	if (!ref) return [];
	const query = new URLSearchParams({ ref, q: '[[at(document.type,"page")]]', pageSize: '100' });
	const resp = await fetch(`${CMS_URL}/documents/search?${query}`, { headers: { 'User-Agent': UA } });
	if (!resp.ok) return [];
	const names: string[] = [];
	const walk = (value: unknown) => {
		if (Array.isArray(value)) value.forEach(walk);
		else if (value && typeof value === 'object') {
			const name = (value as { name?: unknown }).name;
			if (typeof name === 'string') names.push(name.trim());
			Object.values(value).forEach(walk);
		}
	};
	walk(((await resp.json()) as { results?: unknown }).results);
	return names;
}

// the fund's spelling of a name the page prints in capitals
function spelled(printed: string, names: string[]): string {
	const same = names.filter((n) => n.toLowerCase() === printed.toLowerCase());
	same.sort((a, b) => Number(shouted(a)) - Number(shouted(b)) || capitals(b) - capitals(a));
	return same[0] ?? printed;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const names = await spellings().catch(() => []);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const chunk of html.split(ENTRY).slice(1)) {
		const entry = chunk.slice(0, chunk.indexOf('</li>') + 1 || undefined);
		const printed = clean(entry.match(NAME)?.[1] ?? '');
		const exited = EXITED.test(printed);
		const name = spelled(printed.replace(EXITED, ''), names);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unescape(entry.match(HREF)?.[1] ?? '').trim();
		const outcome = exited ? tag(clean(entry.match(LINE)?.[1] ?? '').match(OUTCOME)?.[1] ?? '') : '';
		companies.push({
			name,
			category: [outcome, exited ? 'Exited' : ''].filter(Boolean).join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('breakout: no companies on the portfolio page');
	}

	return companies;
}
