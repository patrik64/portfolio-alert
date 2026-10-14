import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.pitchdrive.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a static page: the portfolio is a wall of logos, the whole of it in the
// page, a logo a company named in its alt text. the page's script carries a
// record for most of them, matched to a logo by its file's name — the
// company's name as its panel writes it ("9ID", where the logo says
// "NineID"), its category ("Productivity", "FinTech"), its country, the
// year the fund came in, the rounds it joined ("Pre-seed 2021 · Seed
// 2022"), its site and, for one the fund is out of, how ("Acquired by
// LexisNexis"); the script marks a few more exits by name alone. the
// logos say which companies are listed; the records add their names,
// sites and tags. the category, the country, the round the fund came in at
// and the year are kept as tags, a sale with its buyer and the Exited tag.
// a script that will not load fails the run rather than leave the logos'
// names to stand for the panels'.

const TILE = /<div class="pf-tile">\s*<img\b[^>]*\bsrc="([^"]*)"[^>]*\balt="([^"]*)"/g;
const SCRIPT = /<script\b[^>]*\bsrc="([^"]*portfolio\.js[^"]*)"/;
const DATA = /var DATA = \[([\s\S]*?)\n\s*\];/;
const RECORD = /\{\s*slug: '(?:[^'\\]|\\.)*'[\s\S]*?\}(?=,?\s*(?:\n|$))/g;
const FIELD = /(\w+): '((?:[^'\\]|\\.)*)'/g;
// exits the script badges without a record: exitSlugs['hotelmanager'] = true;
const MARKED = /exitSlugs\['([^']+)'\]\s*=\s*true/g;
const ROUND = /^(.*?)\s*(?:(?:19|20)\d{2})?$/;
const YEAR = /\b(?:19|20)\d{2}\b/;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
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

// a logo's file name, as the script keys its records: "../assets/pf/nineid.png" -> "nineid"
const slugOf = (src: string) =>
	(src.split('/').pop() ?? '')
		.replace(/\.[a-z0-9]+$/i, '')
		.toLowerCase();

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);
	const script = html.match(SCRIPT)?.[1];
	if (!script) {
		throw new Error('pitchdrive: the portfolio page loads no portfolio script');
	}
	const code = await fetchText(new URL(unescape(script), PAGE_URL).href);
	const records = new Map(
		[...(code.match(DATA)?.[1] ?? '').matchAll(RECORD)].map(([record]) => {
			const fields = new Map(
				[...record.matchAll(FIELD)].map(([, key, value]) => [key, value.replace(/\\(.)/g, '$1')])
			);
			return [(fields.get('slug') ?? '').toLowerCase(), fields];
		})
	);
	if (records.size === 0) {
		throw new Error('pitchdrive: the portfolio script carries no records — the script moved');
	}
	const marked = new Set([...code.matchAll(MARKED)].map(([, slug]) => slug.toLowerCase()));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const [, src, alt] of html.matchAll(TILE)) {
		const slug = slugOf(unescape(src));
		const record = records.get(slug);
		const field = (key: string) => clean(record?.get(key) ?? '');
		const name = field('name') || clean(alt);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		// a bare address is a site too: "nineid.com"
		const address = field('website');
		const site = !address || /^https?:\/\//i.test(address) ? address : `https://${address}`;
		if (site) withSite++;
		const [first = ''] = field('rounds').split(/\s*·\s*/);
		const year = field('year').match(YEAR)?.[0] ?? first.match(YEAR)?.[0];
		const sale = field('exit');
		companies.push({
			name,
			category: [
				tag(field('category')),
				tag(field('country')),
				tag(first.match(ROUND)?.[1] ?? ''),
				year ? `Invested ${year}` : '',
				tag(sale),
				sale || marked.has(slug) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('pitchdrive: no companies on the portfolio wall — the markup moved');
	}
	// without the records every company would link the page here
	if (withSite === 0) {
		throw new Error("pitchdrive: no record gave a company's site — the script moved");
	}

	return companies;
}
