import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.bbgventures.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the companies page is a wall of cards served whole — a logo,
// the founders, a line about the company, and as filters its type ("B2C")
// and sectors ("Health", "Economic Mobility") — and a stamp on the ones
// the fund is out of. not a name is written, no card links anywhere, and
// the logos' files are called "Group 2147238881.svg", so the names are
// kept here, keyed on the id webflow gives each logo image, as the logos
// read and the founders' names bear out; a logo not listed here has
// nothing to name it and is left out until it is added. two cards show a
// "Stealth" logo and are left out with it.
const LOGOS: Record<string, string> = {
	'69dcc26837954ff0acc843c5': 'Arise',
	'69d7758d5f3edf28e87c891d': 'Blip',
	'69dcc55c61a9f3d72a3fb0a5': 'Blueland',
	'69dcae01177aef49cd2d914a': 'Boop',
	'69dcc22983a497cbfcefcfca': 'Byteboard',
	'69dcb44b818bbb0054c915ba': 'Canela Media',
	'69dc85674ee07c3549a79ae5': 'Climatic',
	'69dcc1cddab8cc7862cd789a': 'Evvy',
	'69dcb6af9234c97647f90a32': 'Fiveable',
	'69dcc18141d588a4c530551c': 'Fork & Good',
	'69dcb83f53d482f3b1484fd9': 'Formally',
	'69dcc40249c472eb96f40008': 'Full Harvest',
	'69dcc59a830a1ef8e6bdba85': 'Future Family',
	'69dcc4550fdc554a6af80253': 'goTenna',
	'69dcc34117f50069acdaeeed': 'HopSkipDrive',
	'69dcb8ef3b3abeac4726c1cb': 'Icon',
	'69dcc385fc48fd7e347f773b': 'KiwiCo',
	'69dcb2b26bc4993fa261f551': 'Loula',
	'69d797466d0bd8a81be932b0': 'MaxHome',
	'69dcc4c2fdb65234f9865ac0': 'Mighty Networks',
	'69dcb66afc48fd7e347d2417': 'Millie',
	'69d798a2d9cf250bcccd3b09': 'Mozi',
	'69d770dc88c06c4f827f320c': 'Nara Organics',
	'69dcb35ab09a9d0e9758ca28': 'Naya Homes',
	'69dcb629e6c6521f0c6e34e9': 'Oova',
	'69dcb839697052ef95d45c9b': 'OverAI',
	'69dcb598851291f31bd149c8': 'Ox',
	'69dcb252733c9f9f4874c428': 'Peak Health',
	'69dcb967ce6b6d93f0ca5695': 'Personal AI',
	'69dcb6eec1ba1a51deeaba81': 'Planet FWD',
	'69dcb9b22d5e44476b014308': 'Real',
	'69d797dfe571f882555eb3c5': 'Recess',
	'69dcc484e2f7b16fde618931': 'Spring Health',
	'69dcc4f392c5a46e22b2c9e3': 'Squad',
	'69dcb4ab4145405bc28a8103': 'Starface',
	'69dcb5e29961559d2e73ce44': 'SuperCircle',
	'69d770989b0cf006b1fff6d5': 'Symbium',
	'69dcc5f4d9049e8d3d68f8ca': 'The Mom Project',
	'69dcc63dbed82fbc85420480': 'The Wing',
	'69dc85f0acc91d02a4863cb4': 'Togethxr',
	'69d75ec36f65073a0b3cf0c8': 'Topline Pro',
	'69dcba40dab8cc7862cbf93c': 'Treet',
	'69dcaed2d5448ddef69f647d': 'Unvault',
	'69d7703601385d8fc836d141': 'Upwage',
	'69dcae4d095d2fbcf34f0c59': 'Velvet Hammer',
	'69dcc52a4718e67d44b658b3': 'Winky Lux',
	'69dcc3c4859f3c6d1f00d361': 'Winnie',
	'6a0232b2bde3fbefe9ac62bb': 'WTGL',
	'69dcc2f268632837ac961795': 'Zola'
};

const CARD = /(?=<div class="company-card">)/;
// webflow's id for the logo image heads its file's name
const LOGO = /<img\b[^>]*\bsrc="[^"]*\/([0-9a-f]{24})_[^"]*"[^>]*\bclass="logo-blue"/;
const FIELD = /\bfs-list-field="(type|sector)"[^>]*>([\s\S]*?)<\/div>/g;
const EXITED = /class="company-acquired"/;
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

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const chunk of html.split(CARD).slice(1)) {
		// a card ends where its portrait's wrapper closes; the last runs on to the end of the page
		const end = chunk.indexOf('company-person-image');
		const card = end < 0 ? chunk : chunk.slice(0, chunk.indexOf('</div></div>', end) + 1 || undefined);
		const name = LOGOS[card.match(LOGO)?.[1] ?? ''];
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: [...[...card.matchAll(FIELD)].map(([, , label]) => tag(label)), EXITED.test(card) ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('bbgventures: no companies on the companies page');
	}

	return companies;
}
