import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.pathbreakervc.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace, laid out as blocks on an ordinary page rather than a
// collection, so ?format=json returns a page with no items. a rule separates
// one company from the next: inside it sit the logo, linked to the company,
// and a paragraph or two about it.
//
// the fund writes no name anywhere. so the logo file names the company and the
// paragraph beside it corrects the spelling, exactly where the file is at its
// worst — "lockup_black" and a screenshot's filename are no name at all, and
// their paragraphs open with Framework and FoxGlove. a spelling that runs on
// into more letters is not the name either, which is what keeps frame.work
// from being read as Frame.
//
// an exit is a short block of its own saying who bought the company. it has to
// be that rather than any mention of a purchase: the fund writes up its
// founders' earlier companies too, so Mux, Tingono and Vergesense each sit
// beside an acquisition that is not their own.

const SEPARATOR = /data-definition-name="website\.components\.horizontalrule"/g;
const LOGO = /data-src="(https:\/\/images\.squarespace-cdn\.com\/[^"?]+)"/;
const SITE = /class="\s*sqs-block-image-link\s*"\s*href="(https?:\/\/[^"]+)"/;
const TEXT = /data-block-type="2"[\s\S]*?<div class="sqs-block-content">([\s\S]*?)<\/div>/g;
const BOUGHT = /^acquired by\b/i;
// what a logo file is called besides the brand
const DRESSING =
	/\b(?:logos?|image|lockup|primary|black|white|final|new|large|pixels|horizon|asset|hq|screenshot)\b/gi;
// a company the fund carries but does not name
const UNNAMED = /^stealth\b/i;
// the paragraph opens "<name> builds …", which names a company its own logo
// file does not
const OPENS =
	/^([A-Z][\w.&'’-]*(?:\s+[A-Z0-9][\w.&'’-]*){0,3})\s+(?:is|are|was|were|builds?|provides?|makes?|develops?|creates?|offers?|helps?|has|delivers?|designs?|enables?|powers?|turns?|uses?|brings?|lets?)\b/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]*>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const fromLogo = (src: string) =>
	clean(
		decodeURIComponent(src.split('/').pop() ?? '')
			.replace(/\.[a-z0-9]+$/i, '')
			.replace(/\+/g, ' ')
			.replace(DRESSING, '')
			.replace(/\(\d+\)/g, '')
			.replace(/\b\d[\d.:-]*\b/g, '')
			.replace(/[_]+/g, ' ')
	).replace(/^[\s-]+|[\s-]+$/g, '');

// the same name as the fund's own prose spells it, if it is in there written
// as a name and not as the start of a longer word
const spelledOut = (name: string, prose: string) => {
	const letters = key(name);
	if (letters.length < 3) return '';
	const pattern = [...letters]
		.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
		.join('[\\s\\-.]?');
	const found = prose.match(new RegExp(`(?<![A-Za-z0-9])${pattern}(?![A-Za-z0-9])`))?.[0].trim() ?? '';
	return /[A-Z]/.test(found) ? found : '';
};

const host = (url: string) => {
	try {
		return new URL(url).hostname.replace(/^www\./, '').split('.')[0];
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

	const starts = [...html.matchAll(SEPARATOR)].map((m) => m.index);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [i, at] of starts.entries()) {
		const entry = html.slice(at, starts[i + 1] ?? html.length);

		const logo = entry.match(LOGO)?.[1];
		if (!logo) continue;
		const url = entry.match(SITE)?.[1] ?? '';

		const blocks = [...entry.matchAll(TEXT)].map((m) => clean(m[1]));
		const prose = blocks.join(' ');
		const about = blocks.find((b) => b && !BOUGHT.test(b)) ?? '';

		const brand = fromLogo(logo);
		const name =
			spelledOut(brand, prose) ||
			spelledOut(host(url), prose) ||
			about.match(OPENS)?.[1] ||
			(brand === brand.toLowerCase() ? clean(brand.replace(/\b[a-z]/g, (c) => c.toUpperCase())) : brand);
		if (!name || UNNAMED.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: blocks.find((b) => BOUGHT.test(b) && b.length < 90) ?? '',
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('pathbreaker: no companies on the portfolio page');
	}

	return companies;
}
