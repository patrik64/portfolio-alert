import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.matterwave.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a grid of cards, the whole of it in the page, a
// card a company opening a panel with its headquarters, the year it was
// founded, its sectors ("Computing, Photonics"), a line about it and links
// to its site and its linkedin; for the page's filters it carries its
// category ("Deep Tech", "Climate Tech") and its fund ("Fund I", "Fund II")
// or "Exited". the card writes the company's name nowhere, its logo having
// no alt text.
//
// so the name is read from the line, which mostly opens with it
// ("Akhetonics develops…", "Fruitcore empowers…"): the earliest words there
// that spell the company's linkedin name or its site's, or the words the
// line opens on when they agree with those or with the logo's file. a card
// whose line names the company nowhere is left out.
//
// the category, the sectors, the place, the year and the fund are kept as
// tags, an exit with the Exited tag.

const ITEM = /(?=<div\b[^>]*role="listitem" class="portfolio_collection_item w-dyn-item")/;
const LINK = /<a target="[^"]*" href="([^"]*)" class="g_clickable_link\b/g;
const LINKEDIN = /linkedin\.com\/company\/([^/?#]+)/i;
const LOGO = /<img src="([^"]*)"[^>]*class="portfolio_detail_logo\b/;
const SHORT = /<div class="u-text-align-left">([\s\S]*?)<\/div>/;
const LINE = /class="portfolio_detail_text u-text-align-left mobile w-richtext">([\s\S]*?)<\/div>/;
const PLACE = /class="w-layout-vflex portfolio_detail_headquarter">([\s\S]*?)<\/div><\/div>/;
const FACT = (label: string) =>
	new RegExp(`>${label}:</h6>\\s*<h6 class="portfolio_detail_text[^"]*">([\\s\\S]*?)</h6>`);
const FIELD = (name: string) => new RegExp(`fs-cmsfilter-field="${name}"[^>]*>([^<]*)<`, 'g');
// a company's form a linkedin name ends on: "fruitcore-gmbh", "wise-s-r-l-"
const FORM = /-(?:gmbh|ag|ab|bv|b-v|oy|sa|sas|srl|s-r-l|ltd|limited|inc|llc|nv|aps|as)-?$/i;
const YEAR = /\b(?:19|20)\d{2}\b/;
const EXITED = /^exited$/i;
// a word as a name may be written: "project44", "EFFECT"
const WORD = /[\p{L}\p{N}][\p{L}\p{N}.&'’+-]*/gu;
const VERB =
	/^(?:is|are|was|has|have|offers?|provides?|develops?|designs?|created?|creates|sells?|empowers?|builds?|helps?|delivers?|enables?|operates?|combines?|makes?|turns?|uses?|powers?|transforms?)$/i;
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

const spelled = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// a phrase without the possessive it ends on: "Infinite Orbits’" -> "Infinite Orbits"
const bare = (s: string) => s.replace(/[.,;:]+$/, '').replace(/['’]s?$/, '');

// the company's name as its line writes it — see above
function nameOf(line: string, short: string, linkedin: string, site: string, logo: string): string {
	const host = site.replace(/^https?:\/\/(?:www\.)?/i, '').split(/[/?#]/)[0].split('.')[0];
	// the names, whole and by their first part when that is a word of its
	// own: "zeropoint-technologies-ab" is ZeroPoint too
	const keys = [linkedin, linkedin.replace(FORM, ''), host, linkedin.split('-')[0], host.split('-')[0]]
		.map(spelled)
		.filter((key, i, all) => key && (i < 3 || key.length >= 5) && all.indexOf(key) === i);
	const text = `${short} ${line}`;
	const words = text.match(WORD) ?? [];
	for (let i = 0; i < words.length; i++) {
		for (let n = Math.min(4, words.length - i); n >= 1; n--) {
			const phrase = bare(words.slice(i, i + n).join(' '));
			if (keys.includes(spelled(phrase))) return phrase;
		}
	}
	// the words the line opens on, before its verb, when they agree with a key
	const lead: string[] = [];
	for (const word of line.split(/\s*[,(]\s*/)[0].split(/\s+/).slice(0, 4)) {
		if (VERB.test(word) || !/^[\p{Lu}\p{N}]/u.test(word)) break;
		lead.push(word);
	}
	const opening = bare(lead.join(' '));
	const key = spelled(opening).slice(0, 4);
	const against = [...keys, spelled(logo.split('/').pop() ?? '')];
	return key.length === 4 && against.some((k) => k.includes(key)) ? opening : '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const links = [...item.matchAll(LINK)].map(([, href]) => unescape(href).trim());
		const linkedin = links.map((href) => href.match(LINKEDIN)?.[1] ?? '').find(Boolean) ?? '';
		const site = links.find((href) => /^https?:\/\//i.test(href) && !LINKEDIN.test(href)) ?? '';
		const name = nameOf(
			clean(item.match(LINE)?.[1] ?? ''),
			clean(item.match(SHORT)?.[1] ?? ''),
			linkedin,
			site,
			item.match(LOGO)?.[1] ?? ''
		);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const funds = [...item.matchAll(FIELD('funding_type'))].map(([, fund]) => clean(fund));
		const founded = clean(item.match(FACT('Founded in'))?.[1] ?? '').match(YEAR)?.[0];
		companies.push({
			name,
			category: [
				...[...item.matchAll(FIELD('category'))].map(([, category]) => tag(category)),
				...clean(item.match(FACT('Sector'))?.[1] ?? '').split(',').map(tag),
				...clean(item.match(PLACE)?.[1] ?? '').split(',').map(tag),
				founded ? `Founded ${founded}` : '',
				...funds.filter((fund) => !EXITED.test(fund)).map(tag),
				funds.some((fund) => EXITED.test(fund)) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('matterwave: no companies on the portfolio page — the markup moved');
	}

	return companies;
}
