import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://cathayinnovation.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: under a carousel of featured founders,
// the portfolio is a wall of logos, each carrying the company as data —
// its name, the fund it sits in ("Global Innovation Fund", "Cathay
// Ledger"), the round the fund came in at, the year, its site and, on the
// ones the fund is out of, how it went: "Acquired: Salsify", a listing
// ("NASDAQ: PDD") or plain "Exited". the page holds every logo; the
// filters run in the browser.

const CARD = /<div\b[^>]*\bclass="co-card"([^>]*)>/g;
const ATTR = /\bdata-([\w-]+)="([^"]*)"/g;
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

// "Acquired: Salsify" -> "Acquired by Salsify", "NASDAQ: PDD" -> "IPO (NASDAQ: PDD)"
function outcome(exit: string): string {
	const bought = exit.match(/^acquired:?\s*(.*)$/i);
	if (bought) return bought[1] ? `Acquired by ${bought[1]}` : 'Acquired';
	if (/^[A-Z]{2,}\s*:\s*\S+/.test(exit)) return `IPO (${exit})`;
	return /^exited$/i.test(exit) ? '' : exit;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, attrs] of html.matchAll(CARD)) {
		const data = new Map([...attrs.matchAll(ATTR)].map(([, key, value]) => [key, clean(value)]));
		const name = data.get('name') ?? '';
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const exit = data.get('exit') ?? '';
		const year = data.get('year')?.match(/\b(?:19|20)\d{2}\b/)?.[0];
		const site = data.get('link') ?? '';
		companies.push({
			name,
			category: [
				tag(data.get('fund') ?? ''),
				tag(data.get('round-type') ?? ''),
				year ? `Invested ${year}` : '',
				tag(outcome(exit)),
				exit ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('cathay: no companies on the portfolio page');
	}

	return companies;
}
