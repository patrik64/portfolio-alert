import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://avidventures.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer: the home page's companies section is two lists, "Current" and
// "Exited", each company a card drawn once for wide screens and once for
// narrow, named in its heading, linking its site and saying what it does;
// an exited company's line ends in how it went, "Acquired by Sage in
// 2022", kept without the year. cards named only "Stealth" are left out.

const SECTION = /\bdata-framer-name="companies"[\s\S]*?(?=<div\b[^>]*\bid="(?!companies")|$)/;
const GROUP = /(?=\bdata-framer-name="companies-right-group")/;
const LABEL = /<p\b[^>]*>([\s\S]*?)<\/p>/;
const CARD = /<a\b([^>]*\bdata-framer-name="[^"]*"[^>]*)>([\s\S]*?)<\/a>/g;
const HREF = /\bhref="([^"]*)"/;
const HEADING = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/;
const LINE = /<p\b[^>]*>([\s\S]*?)<\/p>/g;
const OUTCOME = /\b(?:acquired|merged|ipo|went public|listed)\b[^;]*$/i;
const YEAR = /\s+(?:in\s+)?(?:19|20)\d{2}\s*$/i;
const EXITED = /\b(?:exit|exited|acquired|past|realized)\b/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const section = (await resp.text()).match(SECTION)?.[0] ?? '';

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const group of section.split(GROUP).slice(1)) {
		const out = EXITED.test(clean(group.match(LABEL)?.[1] ?? ''));
		for (const [, attributes, body] of group.matchAll(CARD)) {
			const name = clean(body.match(HEADING)?.[1] ?? '');
			if (!name || name === '/' || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const lines = [...body.matchAll(LINE)].map(([, line]) => clean(line));
			const went = out ? (lines.at(-1)?.match(OUTCOME)?.[0] ?? '').replace(YEAR, '') : '';
			const site = unescape(attributes.match(HREF)?.[1] ?? '').trim();
			companies.push({
				name,
				category: [went ? tag(went) : '', out ? 'Exited' : ''].filter(Boolean).join(', '),
				url: /^https?:\/\//i.test(site) ? site : PAGE_URL
			});
		}
	}
	if (companies.length === 0) {
		throw new Error('avid: no companies in the companies section');
	}

	return companies;
}
