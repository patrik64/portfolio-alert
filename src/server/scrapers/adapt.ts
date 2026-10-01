import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://adaptvc.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer: the companies page is a list of cards, each naming the company
// over a line about it and then its fields, each after a label: "Based:",
// "Invested in:" (the stage the fund came in at), "Current stage:",
// "Sector:" and "Link:", its site, or the buyer's on a few it was sold to.
// the cards are drawn more than once, for wide screens without the
// current stage's label and for narrow ones with it, and the labelled
// cards are the ones read, found by their labels rather than by framer's
// class names, which change when the page is rebuilt. the sectors, the
// city and the stage the fund came in at are kept as tags, and a current
// stage of "Acquired" or "IPO" as how the fund got out; a stage short of
// that is left out, as it moves on and a stored row would not follow it.

const PARAGRAPH = /<p\b[^>]*>([\s\S]*?)<\/p>/g;
const HREF = /<a\b[^>]*\bhref="([^"]*)"/;
const LABELS = new Set(['Based:', 'Invested in:', 'Current stage:', 'Sector:', 'Link:']);
const OUT = /^(?:acquired|ipo|merged|exited)\b/i;
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
	const html = await resp.text();

	// every paragraph on the page, in order, as text and as written
	const paragraphs = [...html.matchAll(PARAGRAPH)].map(([, inner]) => ({ text: clean(inner), inner }));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	paragraphs.forEach(({ text }, at) => {
		if (text !== 'Based:' || at < 2) return;
		// the card's fields, label by label, up to the next card's name
		const fields = new Map<string, { text: string; inner: string }>();
		for (let i = at; i + 1 < paragraphs.length && LABELS.has(paragraphs[i].text); i += 2) {
			fields.set(paragraphs[i].text, paragraphs[i + 1]);
		}
		if (!fields.has('Current stage:')) return;
		const name = paragraphs[at - 2].text;
		if (!name || LABELS.has(name) || STEALTH.test(name) || seen.has(name.toLowerCase())) return;
		seen.add(name.toLowerCase());
		const current = tag(fields.get('Current stage:')?.text ?? '');
		const out = OUT.test(current);
		const link = fields.get('Link:');
		const site = unescape(link?.inner.match(HREF)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				...(fields.get('Sector:')?.text ?? '').split(/\s*,\s*/).map(tag),
				tag(fields.get('Based:')?.text ?? ''),
				tag(fields.get('Invested in:')?.text ?? ''),
				out ? current : '',
				out ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	});
	if (companies.length === 0) {
		throw new Error('adapt: no labelled company cards on the companies page');
	}

	return companies;
}
