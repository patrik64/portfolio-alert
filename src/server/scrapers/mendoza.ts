import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://mendoza-ventures.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress under elementor: three headings — the fund's own spelling of
// Artificial Inteligence (AI), Cybersecurity, Fintech — and a logo under each,
// with no name written anywhere and every alt left empty.
//
// so a company is named by its address and by the file its logo was uploaded
// under, and the two are better together than either alone. the address alone
// would call Wabbi Wabbisoft, Listo Listofin and Atlas Atlascard; the file
// alone would call Alyce portcos-3 and spell Kalyp as kaylp. so the file is
// used where the two spell the same letters from the same end, and the address
// where they do not.
//
// two logos are linked to the fund's own news of the company being bought
// rather than to the company, and both were uploaded as portcos-1 and
// portcos-2. a story about an acquisition names the buyer, and a number names
// nobody, so those two are left out.

const HEADING = /<h2 class="elementor-heading-title[^"]*">([\s\S]*?)<\/h2>/g;
const ANCHOR = /<a\b[^>]*?\bhref="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
const LOGO = /<img[^>]*?\bsrc="(https:\/\/mendoza-ventures\.com\/wp-content\/uploads\/[^"]+)"/g;
// the fund's own logo, which stands in the header and the footer
const NOT_A_COMPANY = /^MV-/i;
// the fund's own pages, which name a buyer rather than a company
const THE_FUND = /\/\/(?:[a-z0-9-]+\.)*mendoza-ventures\.com\b/i;
// what the fund puts around a file name when it uploads a logo
const UPLOAD = [
	/\.[a-z0-9]+$/i,
	/-\d+x\d+$/,
	/^portcos?[-_]?\d*[-_]?/i,
	/[-_]portcos?$/i,
	/[-_]\d{4}$/,
	/-\d+$/
];
// second levels that are not the brand
const GENERIC = new Set(['com', 'co', 'net', 'org', 'io', 'ai', 'app']);

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&nbsp;/g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const titled = (s: string) =>
	s === s.toLowerCase() ? s.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : s;

const fromFile = (src: string) => {
	let file = decodeURIComponent(src.split('?')[0].split('/').pop() ?? '');
	for (const decoration of UPLOAD) file = file.replace(decoration, '');
	return clean(file.replace(/[-_]+/g, ' '));
};

const fromHost = (url: string) => {
	try {
		const labels = new URL(url).hostname.replace(/^www\./, '').split('.');
		if (labels.length > 1) labels.pop();
		if (labels.length > 1 && GENERIC.has(labels[labels.length - 1])) labels.pop();
		return labels[labels.length - 1] ?? '';
	} catch {
		return '';
	}
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const body = html.slice(html.indexOf('<body'));

	const headings = [...body.matchAll(HEADING)].map((heading) => ({
		at: heading.index,
		said: clean(heading[1])
	}));
	const anchors = [...body.matchAll(ANCHOR)].map((anchor) => ({
		from: anchor.index,
		to: anchor.index + anchor[0].length,
		url: anchor[1]
	}));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const logo of body.matchAll(LOGO)) {
		const at = logo.index;
		const file = logo[1].split('/').pop() ?? '';
		if (NOT_A_COMPANY.test(file)) continue;

		const around = anchors.find((anchor) => anchor.from < at && at < anchor.to)?.url ?? '';
		const url = THE_FUND.test(around) ? '' : around;
		const stem = fromFile(logo[1]);
		const host = fromHost(url);

		// the file is believed where it and the address begin the same way
		const spelled =
			stem && host && (key(host).startsWith(key(stem)) || key(stem).startsWith(key(host)));
		const name = titled(spelled || !host ? stem : host);
		// a file the fund only numbered names nobody
		if (!name || !/[a-z]/i.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: headings.filter((heading) => heading.at < at).at(-1)?.said ?? '',
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('mendoza: no companies on the portfolio wall');
	}

	return companies;
}
