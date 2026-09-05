import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.sofinnova.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress. the page is a wall of logos, each opening a modal that holds the
// company's therapeutic area, what it works on, whether it is still private,
// and a link to it. the logo tile carries the company's name as a data
// attribute, written in lower case, so it is title-cased back.
//
// the status field mixes spellings — "Acquired", "Aquired", "M & A", and
// "Public | Acquired" for a company that listed and was then bought — so each
// part is read separately. "Public" is a biotech that has floated, which is an
// exit like any other; "Private" is the ordinary case and says nothing.
//
// a few of the addresses were pasted twice over — "http://https://artbio.com/",
// "http://www.www.SeaportTx.com" — so the doubled scheme and host are undone.

const TRIGGER = /data-modal='(modal--portfolio__\d+)' data-title='([^']*)'/g;
const MODAL = /(?=<div class="modal modal--portfolio" data-index=)/;
const MODAL_ID = /id="(modal--portfolio__\d+)"/;
const SITE = /<span class='modal__sidebar-title'><a href='([^']*)'/;
const SCHEME = /^(?:https?:\/\/)+/i;
const EXITED = /^public$/i;
const ACQUIRED = /^(acquired|aquired|m\s*&\s*a)$/i;
const HELD = /^private$/i;

const field = (block: string, label: string) => {
	const m = block.match(
		new RegExp(`<span class='modal__sidebar-title'>${label}</span><span>([^<]*)</span>`)
	);
	return m ? clean(m[1]) : '';
};

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

const titleCase = (s: string) =>
	s
		.split(' ')
		.filter(Boolean)
		.map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

function website(raw: string): string {
	// where a scheme was pasted in front of a whole address, the second one is
	// the address's own
	const doubled = raw.match(SCHEME)?.[0] ?? '';
	const trimmed = /^(?:https?:\/\/){2,}/i.test(doubled)
		? raw.slice(doubled.length - (doubled.toLowerCase().endsWith('https://') ? 8 : 7))
		: raw;
	try {
		const parsed = new URL(trimmed);
		parsed.hostname = parsed.hostname.replace(/^(?:www\.)+/i, 'www.');
		return parsed.toString();
	} catch {
		return '';
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const titles = new Map([...html.matchAll(TRIGGER)].map((m) => [m[1], clean(m[2])]));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const block of html.split(MODAL).slice(1)) {
		const id = block.match(MODAL_ID)?.[1] ?? '';
		const name = titleCase(titles.get(id) ?? '');
		if (!name || seen.has(name)) continue;
		seen.add(name);

		const status = field(block, 'Status')
			.split('|')
			.map((s) => s.trim())
			.filter(Boolean)
			.map((s) => (HELD.test(s) ? '' : EXITED.test(s) ? 'Exited' : ACQUIRED.test(s) ? 'Acquired' : s));

		companies.push({
			name,
			category: [
				field(block, 'Therapeutic Area'),
				field(block, 'Area of Focus'),
				...new Set(status)
			]
				.filter(Boolean)
				.join(', '),
			url: website(block.match(SITE)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('sofinnova: no companies on the portfolio page');
	}

	return companies;
}
