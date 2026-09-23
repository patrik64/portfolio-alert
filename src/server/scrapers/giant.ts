import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.giant.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js on vercel, the content in datocms. the page draws its grid from the
// records it ships in its flight payload — a portfolio company record per
// company, with its name, its site, its slug and the tags the page filters
// by — and says how many there are ("48+ Companies"), which the records are
// held to. a company without a site of its own links its story here.
// "Portfolio" is the tag nearly every one carries, and says nothing.

const CHUNK = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
const RECORD = '{"__typename":"PortfolioCompanyRecord"';
// the count's own text node, once react's comment markers are gone
const STATED = />(\d+)\+?\s*Companies</;
const STEALTH = /^stealth\b/i;

interface CompanyRecord {
	id?: string;
	title?: string;
	slug?: string;
	companyUrl?: string | null;
	tags?: { title?: string }[] | null;
}

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

// every object in the payload that opens as a company record, read to its
// closing brace
function records(flight: string): CompanyRecord[] {
	const found: CompanyRecord[] = [];
	for (let start = flight.indexOf(RECORD); start >= 0; start = flight.indexOf(RECORD, start + 1)) {
		let depth = 0;
		let inString = false;
		let end = start;
		for (; end < flight.length; end++) {
			const c = flight[end];
			if (inString) {
				if (c === '\\') end++;
				else if (c === '"') inString = false;
			} else if (c === '"') inString = true;
			else if (c === '{') depth++;
			else if (c === '}' && --depth === 0) break;
		}
		try {
			found.push(JSON.parse(flight.slice(start, end + 1)) as CompanyRecord);
		} catch {
			// a record cut off or referenced rather than written out
		}
	}
	return found;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const flight = [...html.matchAll(CHUNK)].map((m) => JSON.parse(`"${m[1]}"`) as string).join('');

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const record of records(flight)) {
		const name = clean(record.title ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: (record.tags ?? [])
				.map((t) => tag(t.title ?? ''))
				.filter((t, i, all) => t && !/^portfolio$/i.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: record.companyUrl?.trim() || (record.slug ? `${PAGE_URL}/${record.slug}` : '')
		});
	}

	const stated = Number(html.replace(/<!--[\s\S]*?-->/g, '').match(STATED)?.[1] ?? 0);
	if (companies.length === 0 || companies.length < stated) {
		throw new Error(`giant: read ${companies.length} of the ${stated} companies the page states`);
	}

	return companies;
}
