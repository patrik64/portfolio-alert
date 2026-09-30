import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.coralcap.co/portfolio/?lang=en';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: under a dozen featured companies the
// portfolio is one list of logos, each linking the company's site and
// naming it in its alt text; the featured ones are all in the list again.
// the newer entries are written as the companies are called ("Path
// Robotics") and the older ones as they are registered, in english or in
// japanese ("Cosomil, Inc.", "株式会社カミナシ"), on the english page as on
// the japanese one. the legal form is not part of what a company is called
// and is dropped; a name left in japanese script is given the way the
// company itself writes it in latin letters — on the very logo the fund
// shows, or on its own site — from the list kept here, and one not in the
// list stays as the fund wrote it. one logo has no alt text on the english
// page, and is named by the address it links, as the japanese page names
// it. nothing on the page sorts the companies or marks an exit.
const LATIN: Record<string, string> = {
	'カナリー': 'Canary',
	'カミナシ': 'Kaminashi',
	'グラファー': 'Graffer',
	'コネクテッドロボティクス': 'Connected Robotics',
	'シェアダイン': 'SHAREDINE',
	'すむたす': 'Sumutasu',
	'スパイスコード': 'Spicescode',
	'ダイニー': 'Dinii',
	'チカク': 'Chikaku',
	'ニトエル': 'Nitoel',
	'ハイヤールー': 'HireRoo',
	'ファミトラ': 'Famitra',
	'モニクル': 'Monicle',
	'レターファン': 'LetterFan',
	'レンズ': 'Lens',
	'ロジレス': 'LOGILESS',
	'大熊ダイヤモンドデバイス': 'Ookuma Diamond Device'
};

// the logos with no alt text, by the address they link
const NAMES: Record<string, string> = {
	'generalmatter.com': 'General Matter'
};

const LIST = /<ul\b[^>]*\bclass="c-portfolio-logo-list\b[^"]*"[^>]*>([\s\S]*?)<\/ul>/;
const LINK = /\bhref="([^"]*)"/;
const ALT = /\balt="([^"]*)"/;
// "株式会社カミナシ", "Nstock株式会社", "Cosomil, Inc.", "kikitori Co., Ltd."
const FORM =
	/^(?:株式会社|合同会社|有限会社)\s*|\s*(?:株式会社|合同会社|有限会社)$|[\s.,]*\b(?:Co\.?,?\s*Ltd|Inc|Ltd|LLC|Corporation|Corp|K\.K)\.?$/gi;
const STEALTH = /^stealth\b/i;

const DECORATION = ['goto', 'get', 'try', 'use', 'join', 'with', 'go', 'my'];
const SUBDOMAIN = /^(www|en|de|fr|es|it|pt|nl|uk|us|app|corp|biz|blog|lp\d*)$/i;
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;
const MIN_BRAND = 3;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
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

// what the fund wrote, without the legal form, and in latin letters where
// the company has them
function called(written: string): string {
	const bare = written.replace(FORM, '').trim() || written;
	return LATIN[bare.normalize('NFKC')] ?? bare;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of (html.match(LIST)?.[1] ?? '').split(/<li\b/).slice(1)) {
		const site = unescape(item.match(LINK)?.[1] ?? '').trim();
		const host = /^https?:\/\//i.test(site) ? hostOf(site) : '';
		// a logo is drawn twice, the second time for the hover and without its alt text
		const written = clean(item.match(ALT)?.[1] ?? '');
		const name = written ? called(written) : host ? (NAMES[host] ?? domainName(host)) : '';
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url: host ? site : PAGE_URL });
	}
	if (companies.length === 0) {
		throw new Error('coral: no companies in the portfolio list');
	}

	return companies;
}
