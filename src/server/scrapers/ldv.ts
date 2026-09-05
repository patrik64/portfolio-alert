import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.ldv.co/capital';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace, the portfolio written out as prose: every company is an h2 —
// linked to its own address while the fund holds it, bare once it is out —
// followed by labelled lines for what it does, where it sits and when the
// fund first partnered. h2s also carry the section headings, so a state
// machine walks them in order: companies count only after "Portfolio:",
// "Exits:" and "Previous Investments:" say how to tag what follows, and the
// newsletter box at the bottom ends the walk. one entry is literally called
// "Newco", the fund's slot for a company it does not name yet, and is left
// out until it says who it is.

const H2 = /<h2[^>]*>([\s\S]*?)<\/h2>/g;
const LINK = /<a href="(https?:[^"]+)"[^>]*>([\s\S]*?)<\/a>/;
const LOCATION = /<strong>Location:<\/strong>([^<]*)/;
const PARTNERED = /<strong>First partnered:<\/strong>[^<]*?(\d{4})/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a place written "London, UK" would read
// as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const headings = [...html.matchAll(H2)];
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let section = '';

	for (let i = 0; i < headings.length; i++) {
		const inner = headings[i][1];
		const text = clean(inner);

		if (/^Portfolio:$/i.test(text)) {
			section = 'active';
			continue;
		}
		if (/^Exits:$/i.test(text)) {
			section = 'Exited';
			continue;
		}
		if (/^Previous Investments:$/i.test(text)) {
			section = 'Previous investment';
			continue;
		}
		if (/Stay In The Know/i.test(text)) break;
		if (!section || !text || /^newco$/i.test(text) || seen.has(text.toLowerCase())) continue;
		seen.add(text.toLowerCase());

		// the labelled lines run from this heading to the next one
		const start = headings[i].index! + headings[i][0].length;
		const block = html.slice(start, headings[i + 1]?.index ?? html.length);
		companies.push({
			name: text,
			category: [
				tag(block.match(LOCATION)?.[1] ?? ''),
				block.match(PARTNERED)?.[1] ?? '',
				section === 'active' ? '' : section
			]
				.filter(Boolean)
				.join(', '),
			url: inner.match(LINK)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('ldv: no companies on the portfolio page');
	}

	return companies;
}
