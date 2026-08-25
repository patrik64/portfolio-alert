import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.pluralplatform.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the page is a Next.js app: the portfolio arrives in the RSC flight payload
// (self.__next_f.push chunks) as a `"portfolio":[...]` array of Sanity
// companyProfile objects. name and categories are plain fields; the company's
// site hides in the details rich text, as the link behind a "Website" span
// (the other links point at founder profiles)

interface Block {
	children?: { text?: string; marks?: string[] }[];
	markDefs?: { _key?: string; href?: string }[];
}
interface Profile {
	name?: string;
	category?: { name?: string }[];
	details?: { text?: Block[] }[];
}

// slice out the array starting at `from`, tracking strings so brackets inside
// the rich text can't end it early
function sliceArray(payload: string, from: number): string {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = from; i < payload.length; i++) {
		const ch = payload[i];
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === '\\') escaped = true;
			else if (ch === '"') inString = false;
		} else if (ch === '"') inString = true;
		else if (ch === '[') depth++;
		else if (ch === ']' && --depth === 0) return payload.slice(from, i + 1);
	}
	throw new Error('plural: portfolio array never closes');
}

function website(profile: Profile): string {
	for (const detail of profile.details ?? []) {
		for (const block of detail.text ?? []) {
			const hrefByKey = new Map(
				(block.markDefs ?? []).flatMap((m) => (m._key && m.href ? [[m._key, m.href] as const] : []))
			);
			for (const span of block.children ?? []) {
				if ((span.text ?? '').trim().toLowerCase() !== 'website') continue;
				for (const mark of span.marks ?? []) {
					const href = hrefByKey.get(mark);
					if (href) return href;
				}
			}
		}
	}
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// each push carries one escaped JS string literal; parsing it as a JSON
	// string undoes the escaping, and joining restores the full payload
	const payload = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)]
		.map((m) => JSON.parse(m[1]) as string)
		.join('');

	const first = payload.indexOf('"_type":"companyProfile"');
	if (first < 0) {
		throw new Error('plural: no company profiles in the page payload');
	}

	const parsed: Profile[] = JSON.parse(sliceArray(payload, payload.lastIndexOf('[', first)));

	const companies: ScrapedCompany[] = [];
	for (const profile of parsed) {
		const name = (profile.name ?? '').trim();
		if (!name) continue;
		companies.push({
			name,
			category: (profile.category ?? []).flatMap((c) => (c.name ? [c.name] : [])).join(', '),
			url: website(profile)
		});
	}

	if (companies.length === 0) {
		throw new Error('plural: no companies found in the payload');
	}

	return companies;
}
