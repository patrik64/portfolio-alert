import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.ftw.vc/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace, laid out in rows: under a heading for each fund ("FTW
// Ventures II", "FTW Ventures I") every company is a logo linking its site
// beside a few paragraphs about it, closing on a "Learn More" link. the
// logos carry no names, so a company is known by the address it links to,
// under the name it gives itself, looked up once; one missing from the list
// is named from the opening of its paragraphs ("Galley builds…") or, failing
// that, after its address, until it is added. a logo linking nowhere leaves
// the "Learn More" link to go by.
const NAMES: Record<string, string> = {
	'altrfltr.com': 'ALTR',
	'bostonbioprocess.com': 'Boston Bioprocess',
	'brilliantpowered.com': 'Brilliant Harvest',
	'debutbiotech.com': 'Debut',
	'earthodic.com': 'Earthodic',
	'freshfry.me': 'FreshFry',
	'galleysolutions.com': 'Galley',
	'geltor.com': 'Geltor',
	'heritable.ag': 'Heritable',
	'izote.bio': 'Izote Biosciences',
	'nfinitenano.com': 'Nfinite Nanotech',
	'peoplescience.health': 'People Science',
	'phytoformlabs.com': 'Phytoform',
	'plantiblefoods.com': 'Plantible Foods',
	'quorum-bio.com': 'Quorum Bio',
	'snowlinetech.com': 'Snowline',
	'spoileralert.com': 'Spoiler Alert',
	'sylvanhealth.com': 'Sylvan Health',
	'thombar.ag': 'Thombar',
	'wearise.com': 'Arise',
	'yalibio.com': 'Yali Bio'
};

const BLOCK = /(?=<div class="sqs-block )/;
const IMAGE_BLOCK = /\bimage-block\b/;
const HTML_BLOCK = /\bhtml-block\b/;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const LEARN_MORE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*>\s*Learn More/i;
const FUND = /^ftw ventures\s+([ivx]+)$/i;
// the name, up to the verb the paragraph goes on with
const OPENING =
	/^(.{1,40}?)\s+(?:is|are|was|builds|creates|designs|combines|enables|provides|develops|makes|offers|helps|uses|delivers)\b/;
const STEALTH = /^stealth\b/i;

const DECORATION = ['goto', 'get', 'try', 'use', 'join', 'with', 'go', 'my'];
const SUBDOMAIN = /^(www|en|de|fr|es|it|pt|nl|uk|us|app)$/i;
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;
const MIN_BRAND = 3;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;|&rsquo;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const hostOf = (url: string) => {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
	} catch {
		return '';
	}
};

// "getfoo.com" -> "Foo", "ark-climate.de" -> "Ark Climate"
function domainName(host: string): string {
	const parts = host.split('.').filter((part) => !SUBDOMAIN.test(part));
	let label =
		parts.length >= 3 && SUFFIX.test(parts[parts.length - 2])
			? parts[parts.length - 3]
			: (parts[parts.length - 2] ?? parts[0] ?? '');
	const bare = DECORATION.find((d) => label.startsWith(d) && label.length - d.length >= MIN_BRAND);
	if (bare) label = label.slice(bare.length);
	return label
		.split('-')
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');
}

function opening(text: string): string {
	const name = text.match(OPENING)?.[1]?.trim() ?? '';
	return name && !/[,;:]\s|\.\s|[!?]/.test(name) && name.split(' ').length <= 4 ? name : '';
}

interface Entry {
	link: string;
	text: string;
	fund: string;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// each logo, and the paragraphs after it
	const entries: Entry[] = [];
	let fund = '';
	let logo: Entry | null = null;
	for (const block of html.split(BLOCK).slice(1)) {
		const head = block.slice(0, 400);
		if (IMAGE_BLOCK.test(head)) {
			if (logo) entries.push(logo);
			logo = { link: unescape(block.match(LINK)?.[1] ?? ''), text: '', fund };
			continue;
		}
		if (!HTML_BLOCK.test(head)) continue;
		const text = clean(block.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' '));
		const heading = text.match(FUND);
		if (heading) {
			if (logo) entries.push(logo);
			logo = null;
			fund = `Fund ${heading[1].toUpperCase()}`;
			continue;
		}
		if (!logo || !text || logo.text) continue;
		logo.text = text;
		logo.link = logo.link || unescape(block.match(LEARN_MORE)?.[1] ?? '');
		entries.push(logo);
		logo = null;
	}
	if (logo) entries.push(logo);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const entry of entries) {
		const host = hostOf(entry.link);
		const name = NAMES[host] ?? (opening(entry.text) || (host ? domainName(host) : ''));
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: entry.fund, url: entry.link });
	}

	if (companies.length === 0) {
		throw new Error('ftw: no companies on the companies page');
	}

	return companies;
}
