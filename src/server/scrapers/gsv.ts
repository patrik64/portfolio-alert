import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://gsv.ventures/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress on wp engine, the whole portfolio in the page: the featured
// companies show first and the "All" filter shows the rest, every card there
// all along. a card's classes carry what the filters sort by — the fund it
// came from ("fund2"), whether the fund is still in it or has exited, and
// whether it has become a unicorn — and the card itself names the company,
// links its site ("Learn more about Abwaab") and lists what the fund notes of
// it: the round and year it came in ("Seed, 2020"), and a segment written
// freehand. the funds are named as their filters name them ("Fund II").

const ITEM = /(?=<div\s+data-position="\d+"\s+class="c-grid--item\b)/;
const CLASSES = /class="c-grid--item\b([^"]*)"/;
const NAME = /<span class="company-name">([\s\S]*?)<\/span>/;
const SITE = /<a\b[^>]*\bhref="([^"]+)"[^>]*>(?:\s|<[^>]+>)*Learn more/i;
const INFO = /<span\s+class="company-info--title">([^<]*)<\/span>([\s\S]*?)<\/li>/g;
const FILTER = /<span\b[^>]*\bdata-filter="(fund\d+)"[^>]*>([\s\S]*?)<\/span>/g;
const YEAR = /\b(?:19|20)\d{2}\b/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;|&rsquo;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// "https://https://www.doowii.io/" -> "https://www.doowii.io/"
const repaired = (url: string) => unescape(url).trim().replace(/^https?:\/\/(?=https?:\/\/)/i, '');

// "Series B, 2015" -> the round and "Invested 2015"; "2014 (via Acquisition)"
// -> the year alone
function investment(text: string): string[] {
	const plain = text.replace(/^investment\s+/i, '').replace(/\([^)]*\)/g, ' ');
	const year = plain.match(YEAR)?.[0];
	const round = plain.replace(YEAR, ' ').replace(/[\s,]+/g, ' ').trim();
	return [round ? tag(round) : '', year ? `Invested ${year}` : ''];
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const funds = new Map([...html.matchAll(FILTER)].map(([, key, label]) => [key, clean(label)]));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split(ITEM).slice(1)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const classes = (card.match(CLASSES)?.[1] ?? '').split(/\s+/).filter(Boolean);
		const info = new Map([...card.matchAll(INFO)].map(([, title, value]) => [clean(title), clean(value)]));
		companies.push({
			name,
			category: [
				tag(info.get('Segment') ?? ''),
				...classes.filter((c) => /^fund\d+$/.test(c)).map((c) => funds.get(c) ?? c),
				...investment(info.get('Investment') ?? ''),
				classes.includes('unicorn') ? 'Unicorn' : '',
				classes.includes('exited') ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: repaired(card.match(SITE)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('gsv: no companies on the portfolio page');
	}

	return companies;
}
