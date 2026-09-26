import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.crosslinkcapital.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: every company is a box whose classes say
// whether it is current or an exit and which side of the fund it sits on,
// enterprise or consumer; behind the logo, the name, a line about it — on
// an exit ending with how it went, "Acquired by Permira" — and a link to
// its site. the filters run in the browser, so the page holds every box.

const BOX = /(?=<div class="each-box\s)/;
const CLASSES = /^<div class="each-box\s+([^"]*)"/;
const NAME = /class="client-desc"[^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>/;
const LINE = /class="client-desc"[^>]*>\s*<h3[^>]*>[\s\S]*?<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/;
const LINK = /class="web-link"[^>]*>\s*<a\b[^>]*\bhref="([^"]*)"/;
const OUTCOME = /\b(acquired by .+|acquired|merged with .+|ipo\b.*|went public.*)$/i;
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

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const box of html.split(BOX).slice(1)) {
		const name = clean(box.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const classes = (box.match(CLASSES)?.[1] ?? '').split(/\s+/).filter(Boolean);
		const sector = classes.find((c) => !/^(current|exits?|featured)$/i.test(c)) ?? '';
		// the line breaks before the outcome; the last line is read for it
		const lines = (box.match(LINE)?.[1] ?? '').split(/<br\s*\/?>/i).map(clean).filter(Boolean);
		const outcome = lines.length > 1 ? (lines[lines.length - 1].match(OUTCOME)?.[1] ?? '') : '';
		const exited = classes.some((c) => /^exits?$/i.test(c)) || Boolean(outcome);
		companies.push({
			name,
			category: [
				sector ? sector[0].toUpperCase() + sector.slice(1) : '',
				outcome ? tag(outcome[0].toUpperCase() + outcome.slice(1)) : '',
				exited ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: unescape(box.match(LINK)?.[1] ?? '').trim() || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('crosslink: no companies on the portfolio page');
	}

	return companies;
}
