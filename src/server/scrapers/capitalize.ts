import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.capitalizevc.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wix: the portfolio is a gallery on the home page, its items handed to
// the page as data — each a logo image and, on most, a link to the
// company's site. not a name is written, the images carry no alt text and
// their files are called "Frame 22.png", and the one exit is marked only
// by an "Exit" corner drawn into its logo. so the names are kept here,
// keyed on the address a logo links, as the logos read; the logo that
// links nowhere is keyed on its image. an address not listed here still
// imports, named after itself the way the other domain-named scrapers do
// it, until it is added; an unlinked image not listed is left out.
const NAMES: Record<string, string> = {
	'airpals.co': 'Airpals',
	'atronous.ai': 'Atronous.ai',
	'digiphy.it': 'Digiphy',
	'eatomega3.com': 'Omega 3 Nutrition',
	'fanfare.io': 'Fanfare',
	'getnoise.com': 'Noise',
	'gildform.com': 'Gildform',
	'gudea.ai': 'Gudea',
	'hanahanabeauty.com': 'Hanahana Beauty',
	'hellowarrant.com': 'Warrant',
	'popcall.com': 'Popcall',
	'rivet.app': 'Rivet',
	'rx-post.com': 'RxPost',
	'talawa.ai': 'Talawa',
	'truetoform.fit': 'True to Form',
	'usebump.com': 'Bump',
	'vow.app': 'Vow'
};

// the logos that link nowhere, by their images, and whether they say "Exit"
const IMAGES: Record<string, { name: string; exited: boolean }> = {
	'468eba_db401341c5c5416a8d98bbca5ee5bfdf~mv2.png': { name: 'Kribi Coffee', exited: true }
};

const GALLERY = /_galleryData":\{"items":/;

interface Item {
	mediaUrl?: string;
	metaData?: { link?: { data?: { url?: string }; url?: string } };
}

const DECORATION = ['goto', 'get', 'try', 'use', 'join', 'with', 'go', 'my', 'hello', 'eat'];
const SUBDOMAIN = /^(www|en|de|fr|es|it|pt|nl|uk|us|app)$/i;
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;
const MIN_BRAND = 3;

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

// the gallery's items: the json array that follows its name in the page
function galleryItems(html: string): Item[] {
	const at = html.search(GALLERY);
	if (at < 0) return [];
	const start = html.indexOf('[', at);
	let depth = 0;
	let inString = false;
	for (let i = start; i < html.length; i++) {
		const c = html[i];
		if (inString) {
			if (c === '\\') i++;
			else if (c === '"') inString = false;
		} else if (c === '"') inString = true;
		else if (c === '[') depth++;
		else if (c === ']' && --depth === 0) return JSON.parse(html.slice(start, i + 1)) as Item[];
	}
	return [];
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const items = galleryItems(await resp.text());

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		const link = item.metaData?.link;
		const site = (link?.data?.url ?? link?.url ?? '').trim();
		const host = /^https?:\/\//i.test(site) ? hostOf(site) : '';
		const image = host ? undefined : IMAGES[item.mediaUrl ?? ''];
		const name = host ? (NAMES[host] ?? domainName(host)) : (image?.name ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: image?.exited ? 'Exited' : '', url: host ? site : PAGE_URL });
	}
	if (companies.length === 0) {
		throw new Error('capitalize: no companies in the portfolio gallery');
	}

	return companies;
}
