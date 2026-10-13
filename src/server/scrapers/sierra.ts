import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.sierraventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// hubspot. /portfolio holds every company now (the old /portfolio-all-items
// and the sector pages send you there): its table is drawn in the browser
// from a list written into the page's script, one entry a company, giving
// its name, its sectors ("Vertical AI", "AI Infrastructure"), the stage the
// fund came in at, its status ("Current", "Exited"), the way out ("Exited",
// "IPO"), its site and a description that, for a sale, mostly opens on
// "Acquired by Oracle Corporation (NASDAQ: ORCL)". the sectors, the stage
// and the way out are kept as tags, an opening buyer as "Acquired by …"
// with the ticker dropped, an exit or a listing with the Exited tag.

const LIST = 'let arr_obj_portfolio = [';
const ENTRY = /(?=\{\s*"featured":)/;
// a field of an entry: each on its own line, the sectors' and the status's
// own names being inside them
const FIELD = (name: string) => new RegExp(`^\\s*"${name}":\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'm');
const STATUS = /"status":\s*\{\s*"name":\s*"([^"]*)"/;
const SECTORS = /"sector":\s*\[([^\]]*)\]/;
const SECTOR = /\{\s*"name":\s*"((?:[^"\\]|\\.)*)"/g;
const DESCRIPTION = /"description":\s*`([\s\S]*?)`/;
// the description's opening paragraph or heading
const OPENING = /<(p|h\d|div)\b[^>]*>([\s\S]*?)<\/\1>/;
const BUYER = /^acquired by\s+(.+?)\.?$/i;
const TICKER = /\s*\((?:nasdaq|nyse)\b[^)]*\)/gi;
const EXITED = /^exited$/i;
const IPO = /^ipo$/i;
const UNSAID = /^(?:-|other|others|all|n\/a|current)$/i;
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

// a javascript string's contents, its escapes undone where they are json's
const literal = (s: string) => {
	try {
		return JSON.parse(`"${s}"`) as string;
	} catch {
		return s;
	}
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const start = html.indexOf(LIST);
	if (start < 0) {
		throw new Error("sierra: the page's script carries no portfolio list — the page moved");
	}
	const list = html.slice(start, html.indexOf('</script>', start));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const entry of list.split(ENTRY).slice(1)) {
		const field = (name: string) => clean(literal(entry.match(FIELD(name))?.[1] ?? ''));
		const name = field('name');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const sectors = [...(entry.match(SECTORS)?.[1] ?? '').matchAll(SECTOR)].map(([, s]) => tag(literal(s)));
		const wayOut = field('acquired');
		const opening = entry.match(DESCRIPTION)?.[1].match(OPENING)?.[2] ?? '';
		const buyer = clean(opening).match(BUYER)?.[1].replace(TICKER, '').trim();
		const ipo = IPO.test(wayOut);
		const out = ipo || EXITED.test(wayOut) || EXITED.test(entry.match(STATUS)?.[1] ?? '') || !!buyer;
		const site = field('website');
		companies.push({
			name,
			category: [
				...sectors,
				tag(field('stage')),
				buyer ? `Acquired by ${tag(buyer)}` : '',
				ipo ? 'IPO' : '',
				out ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('sierra: no companies in the portfolio list — its entries moved');
	}

	return companies;
}
