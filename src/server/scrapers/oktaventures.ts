import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.okta.com/company/okta-ventures/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// adobe experience manager: the portfolio is a run of column-content items
// under the "Portfolio Companies" title, each a logo (its alt text empty,
// its file named as the designer pleased), a paragraph that opens with the
// company's name, and either a note in small print that the company was
// acquired, by whom and when, or a button to its open roles. the name is
// read from the paragraph's opening: its first word and the capitalised
// words after it, a possessive dropped. the button names the company too,
// but with slips (one names another company altogether), so the company's
// site is taken from the button's address only when that is on a domain
// of the company's own name rather than a job board's; a company without
// such a button comes without a site. an acquired company is tagged with
// its buyer and as exited.

const SECTION = /title="Portfolio Companies"/;
const TITLE = /class="cmp-title__title"/;
const ITEM = /(?=<div[^>]*class="[^"]*\bcmp-column-content-item\b)/;
const BODY = /cmp-column-content-item__body[^>]*>\s*<p>([\s\S]*?)<\/p>/;
const OPENING = /^(\S+)((?:\s+[A-Z0-9][^\s,.:;!?]*)*)/;
const ACQUIRED = /Acquired by ([^<]*?)(?:\s+in\s+\d{4})?\s*</;
const BUTTON = /cmp-column-content-item__button-container[\s\S]*?<a\b[^>]*\bhref="([^"]*)"/;
const JOB_BOARD =
	/(?:^|\.)(?:lever\.co|greenhouse\.io|workable\.com|ashbyhq\.com|bamboohr\.com|breezy\.hr|jobvite\.com|smartrecruiters\.com|myworkdayjobs\.com|linkedin\.com|wellfound\.com|notion\.site|rippling\.com|gem\.com)$/i;
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

// the company's site, when the button's address is on a domain of its own name
function siteOf(href: string, name: string): string {
	let host: string;
	try {
		host = new URL(unescape(href)).hostname.toLowerCase();
	} catch {
		return '';
	}
	if (JOB_BOARD.test(host)) return '';
	const own = host.replace(/^(?:jobs|careers|boards|apply)\./, '');
	const word = name.toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, '');
	return word && own.replace(/[^a-z0-9]/g, '').includes(word) ? `https://${own}/` : '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const start = html.search(SECTION);
	if (start < 0) {
		throw new Error('oktaventures: no "Portfolio Companies" title in the page — the markup moved');
	}
	const rest = html.slice(start);
	const end = rest.search(TITLE);
	const section = end < 0 ? rest : rest.slice(0, end);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of section.split(ITEM).slice(1)) {
		const opening = clean(item.match(BODY)?.[1] ?? '').match(OPENING);
		const name = opening
			? `${opening[1]}${opening[2]}`.replace(/[,.:;!?]+$/, '').replace(/['’]s$/, '')
			: '';
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const buyer = clean(item.match(ACQUIRED)?.[1] ?? '');
		companies.push({
			name,
			category: [buyer ? `Acquired by ${tag(buyer)}` : '', buyer ? 'Exited' : ''].filter(Boolean).join(', '),
			url: siteOf(item.match(BUTTON)?.[1] ?? '', name)
		});
	}

	if (companies.length === 0) {
		throw new Error('oktaventures: no companies under the "Portfolio Companies" title');
	}

	return companies;
}
