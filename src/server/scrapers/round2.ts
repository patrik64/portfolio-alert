import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://round2cap.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress over elementor: the portfolio is a table, the whole of it in
// the page, a row a company giving the year of the investment, its logo, a
// line about it and a link to its site ("Visit https://nect.com/") — but
// not its name, the logo having no alt text and the row no page of its own.
//
// so the name is read from the line, which opens with it as a rule ("Nect
// offers…", "Shortcut Labs created Flic…", "Quivo, formerly known as
// Logsta, is…"): the words before the first verb, comma or bracket, taken
// when they agree with the row's site or its logo's file, or when they are
// a short run of capitalised words ("H&C is…"). failing that, the words in
// the line that spell the site's name, or the site's name itself. the year
// is kept as a tag; the fund does not say which companies it is out of.

const ROW = /(?=<div class="jet-listing-grid__item jet-listing-dynamic-post-\d+)/;
const TEXT = /class="elementor-heading-title elementor-size-default">([\s\S]*?)<\/div>/g;
const SITE = /<a href="([^"]*)"[^>]*>\s*Visit\s/;
const LOGO = /<img\b[^>]*\bsrc="([^"]*)"/;
const YEAR = /^(?:19|20)\d{2}$/;
// the verbs a line opens on after the name
const VERB =
	/^(?:is|are|was|has|have|offers?|provides?|develops?|designs?|created?|creates|sells?|accelerates?|empowers?|builds?|helps?|delivers?|enables?|operates?|connects?|combines?|makes?|brings?|uses?|runs?|turns?|gives?|lets?|allows?|powers?|specialises|specializes|focuses|serves?|supports?|transforms?|automates?|manages?)$/i;
// a word as a name may be written: "Envise.io", "H&C", "3GSM"
const WORD = /[\p{L}\p{N}][\p{L}\p{N}.&'’+-]*/gu;
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

const spelled = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// "https://www.marketlogicsoftware.com/" -> "marketlogicsoftware"
const hostName = (site: string) =>
	site
		.replace(/^https?:\/\/(?:www\.)?/i, '')
		.split(/[/?#]/)[0]
		.split('.')[0];

// the company's name as its line writes it — see above
function nameOf(line: string, site: string, logo: string): string {
	const host = spelled(hostName(site));
	const file = spelled(logo.split('/').pop()?.replace(/\.\w+$/, '') ?? '');
	// the words before the first verb, comma, bracket or dash
	const head = line.split(/\s*[,(]\s*|\s+[–—-]\s+/)[0];
	const lead: string[] = [];
	for (const word of head.split(/\s+/).slice(0, 6)) {
		if (VERB.test(word) || (/^[a-z]/.test(word) && lead.length > 0)) break;
		lead.push(word);
	}
	const opening = lead.join(' ').replace(/['’]s$/, '').replace(/^[\s.]+|[\s.]+$/g, '');
	const key = spelled(opening);
	const agrees = key.length > 0 && (host.includes(key.slice(0, 4)) || file.includes(key.slice(0, 4)) || key.includes(host.slice(0, 4)));
	const capitalised = lead.length > 0 && lead.length <= 3 && lead.every((word) => /^[\p{Lu}\p{N}]/u.test(word));
	if (opening && (agrees || capitalised)) return opening;
	// the words in the line that spell the site's name
	const words = line.match(WORD) ?? [];
	for (let i = 0; i < words.length; i++) {
		for (let n = Math.min(4, words.length - i); n >= 1; n--) {
			const phrase = words.slice(i, i + n).join(' ').replace(/[.,;:]+$/, '');
			if (host && spelled(phrase) === host) return phrase;
		}
	}
	const bare = hostName(site);
	return bare ? bare[0].toUpperCase() + bare.slice(1) : '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of html.split(ROW).slice(1)) {
		const site = unescape(row.match(SITE)?.[1] ?? '').trim();
		const texts = [...row.matchAll(TEXT)].map(([, text]) => clean(text));
		const line = texts.find((text) => text.length > 40) ?? '';
		// a row with neither a site nor a line is no company
		if (!/^https?:\/\//i.test(site) || !line) continue;
		const name = nameOf(line, site, row.match(LOGO)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const year = texts.find((text) => YEAR.test(text));
		companies.push({
			name,
			category: [year ? `Invested ${year}` : ''].filter((t) => t && !UNSAID.test(t)).join(', '),
			url: site
		});
	}

	if (companies.length === 0) {
		throw new Error('round2: no companies in the portfolio table — the markup moved');
	}

	return companies;
}
