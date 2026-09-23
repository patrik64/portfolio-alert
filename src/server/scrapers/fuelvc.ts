import type { ScrapedCompany } from './types';

const API_URL = 'https://fuelventurecapital.com/api/public/portfolios';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a vue app over the fund's own api: the portfolio page is drawn from the
// public portfolios endpoint, which answers with every company it shows —
// its name, its site, the year the fund came in ("Fueled in 2025"), an icon
// for a unicorn or a "soonicorn", and a corner label the fund sets by hand,
// "EXITED" on the ones it is out of.

interface Portfolio {
	name?: string;
	fueled?: string | number | null;
	icon?: string | null;
	corner_label?: string | null;
	ext?: { Website?: string | null } | null;
}

interface Answer {
	ok?: boolean;
	d?: Portfolio[];
}

const EXIT = /\b(exit(ed)?|acquired|ipo)\b/i;
const ICONS: Record<string, string> = { unicorn: 'Unicorn', soonicorn: 'Soonicorn' };
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
	const resp = await fetch(API_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${API_URL}: ${resp.status}`);
	}
	const answer = (await resp.json()) as Answer;
	if (!answer.ok || !Array.isArray(answer.d)) {
		throw new Error('fuelvc: the portfolio api answered without companies');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const company of answer.d) {
		const name = clean(company.name ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const year = String(company.fueled ?? '').match(/\b(?:19|20)\d{2}\b/)?.[0];
		const label = clean(company.corner_label ?? '');
		const exited = EXIT.test(label);
		companies.push({
			name,
			category: [
				year ? `Invested ${year}` : '',
				ICONS[(company.icon ?? '').toLowerCase()] ?? '',
				// a label that is not the exit says something of its own
				label && !exited ? tag(label) : '',
				exited ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: unescape(company.ext?.Website ?? '').trim()
		});
	}

	if (companies.length === 0) {
		throw new Error('fuelvc: the portfolio api lists no companies');
	}

	return companies;
}
