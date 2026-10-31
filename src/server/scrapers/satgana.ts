import type { ScrapedCompany } from './types';

const SCRIPT_URL = 'https://www.satgana.com/assets/site.js';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// in october 2026 the fund swapped framer for a hand-made static page: the
// portfolio is an empty section until the site's script draws it from a list
// the script carries, a row per company with its name, the continent the
// filters read, the city it works from — a flag after it — a sentence about it
// and its site. the old site never wrote the names, so they were looked up
// once; the two the fund now spells differently are read as stored.

const LIST = /\bconst companies\s*=\s*(\[\s*\[[\s\S]*?\]\s*\])\s*;/;
// a flag is a pair of regional indicator letters
const FLAG = /[\u{1F1E6}-\u{1F1FF}]{2}/u;

// companies stored under the names they were looked up by
const STORED_AS: Record<string, string> = {
	'amini ai': 'Amini',
	'flox intelligence': 'Flox'
};

const countries = new Intl.DisplayNames(['en'], { type: 'region' });

// "Nairobi 🇰🇪" -> "Nairobi, Kenya"; a card may name a country outright
function place(text: string): string {
	const flag = text.match(FLAG)?.[0];
	const city = text.replace(FLAG, '').trim();
	const code = flag
		? [...flag].map((c) => String.fromCharCode(c.codePointAt(0)! - 0x1f1e6 + 65)).join('')
		: '';
	let country = '';
	try {
		country = code ? (countries.of(code) ?? '') : '';
	} catch {
		// an indicator pair that names no region is only a picture
	}
	return [city, country && country !== city ? country : ''].filter(Boolean).join(', ');
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(SCRIPT_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${SCRIPT_URL}: ${resp.status}`);
	}
	const list = (await resp.text()).match(LIST)?.[1];
	if (!list) {
		throw new Error("satgana: no list of companies in the site's script");
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [shown, , city, , url] of JSON.parse(list) as string[][]) {
		const name = STORED_AS[shown.trim().toLowerCase()] ?? shown.trim();
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: place(city), url });
	}

	if (companies.length === 0) {
		throw new Error("satgana: no companies in the site's script");
	}

	return companies;
}
