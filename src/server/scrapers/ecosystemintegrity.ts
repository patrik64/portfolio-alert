import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://eif.vc/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress on divi: the portfolio is a grid of logos under two headings,
// "EXITS" and "Portfolio Companies", each logo opening a popup drawn into
// the same page (a module with id "overlay_unique_id_N" opens the popup
// "overlay-describedby-N"). a popup holds the logo again and a few lines on
// the company, led by its address ("www.vammo.com") or, for an exit, by how
// it ended ("Sold to PepsiCo (PEP) December 2016", "Management buyout
// December 2019"). the logos carry no names (their alt text is empty, or a
// file name) and the popup posts are not in the site's rest api, so a
// company is known by its address, under the name it gives itself, looked
// up once, and one with no address by its logo's file. one missing from the
// list is named after its address or, failing that, its file, until it is
// added. an exit keeps its buyer as "Acquired by …" with the Exited tag.
const NAMES: Record<string, string> = {
	// exits, by logo file
	kevita: 'KeVita',
	'evconnect-logo-regular': 'EV Connect',
	'logo-zep-solar': 'Zep Solar',
	'amp-logo-header': 'AMP',
	'one-energy-renewables-logo': 'One Energy Renewables',
	'ecosystem-integrity-portfolio-emotorwerks-logo': 'eMotorWerks',
	sunverge: 'Sunverge',
	'ecosystem-integrity-portfolio-opti-rtc-logo': 'Opti',
	// the companies, by address
	'vammo.com': 'Vammo',
	'burnbot.com': 'BurnBot',
	'endwaste.io': 'Glacier',
	'floodbase.com': 'Floodbase',
	'betterfleet.com': 'BetterFleet',
	'vecmocon.com': 'Vecmocon',
	'poseidonos.com': 'Poseidon',
	'clarostechnologies.com': 'Claros Technologies',
	'iyris.com': 'iyris',
	'revalue.earth': 'Revalue Nature',
	'batterysmart.in': 'Battery Smart',
	'liminalinsights.com': 'Liminal',
	't8notch.com': 'The Eighth Notch',
	'vibrantplanet.net': 'Vibrant Planet',
	'ambientphotonics.com': 'Ambient Photonics',
	'shoreline.no': 'Shoreline',
	'ride1up.com': 'Ride1Up',
	'trashie.io': 'Trashie',
	'ampersand.solar': 'Ampersand',
	'zeroavia.com': 'ZeroAvia',
	'energicitycorp.com': 'Energicity',
	'upflex.com': 'Upflex',
	'bluon.com': 'Bluon',
	// the popup links flying embers and describes its drinks, under juneshine's
	// logo; the logo is the name the fund now shows
	'flyingembers.com': 'JuneShine',
	'sanafoods.com': 'SANA',
	'pegasussolar.com': 'Pegasus Solar',
	'sunpower.com': 'SunPower',
	'synovatech.com': 'Synova',
	// the companies with no address, by logo file
	mito_png: 'MITO',
	'synchronet-logo-cmyk': 'SynchroNet'
};

const EXITS = /<h2>\s*EXITS\s*<\/h2>/i;
const CURRENT = /<h2>\s*Portfolio Companies\s*<\/h2>/i;
const LOGO =
	/<div id="overlay_unique_id_(\d+)" class="et_pb_module et_pb_image\b[^"]*"[^>]*>[\s\S]*?<img\b[^>]*\bsrc="([^"]*)"/g;
const POPUP_END = '<style class="divioverlay-design-styles">';
const ADDRESS = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/g;
const MONTH = '(?:January|February|March|April|May|June|July|August|September|October|November|December)';
// "Sold to PepsiCo (PEP) December 2016" -> "PepsiCo"
const SOLD = new RegExp(`^Sold to\\s+(.+?)(?:\\s*\\([A-Z.]+\\))?(?:\\s+${MONTH})?(?:\\s+(?:19|20)\\d{2})?$`, 'i');
const OWN_SITE = /(?:^|\.)eif\.vc$/i;

const DECORATION = ['goto', 'get', 'try', 'use', 'join', 'with', 'go', 'my'];
const SUBDOMAIN = /^(www|en|us|uk|app)$/i;
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;
const MIN_BRAND = 3;
// what a designer leaves in a logo's file name around the company's own
const FILE_NOISE =
	/^(?:logo|logos|black|white|color|colour|rgb|cmyk|png|jpg|scaled|transparent|horizontal|wordmark|primary|full|lockup|header|regular|icon|artwork|badge|ecosystem|integrity|portfolio|\d+x?|\d+x\d+|@\dx)$/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => s.replace(/\s*,\s*/g, ' / ');

const hostOf = (url: string) => {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, '').replace(/^us\./, '');
	} catch {
		return '';
	}
};

// "http://eif.vc/wp-content/uploads/2013/08/kevita.jpg" -> "kevita"
const fileOf = (src: string) =>
	decodeURIComponent(src.replace(/[?#].*$/, '').replace(/^.*\//, ''))
		.replace(/\.(png|jpe?g|svg|webp|gif)$/i, '')
		.replace(/-e\d{10,}$/, '')
		.toLowerCase();

const titled = (words: string[]) => words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

// "getfoo.com" -> "Foo", "ark-climate.de" -> "Ark Climate"
function domainName(host: string): string {
	const parts = host.split('.').filter((part) => !SUBDOMAIN.test(part));
	let label =
		parts.length >= 3 && SUFFIX.test(parts[parts.length - 2])
			? parts[parts.length - 3]
			: (parts[parts.length - 2] ?? parts[0] ?? '');
	const bare = DECORATION.find((d) => label.startsWith(d) && label.length - d.length >= MIN_BRAND);
	if (bare) label = label.slice(bare.length);
	return titled(label.split('-').filter(Boolean));
}

// "vammo_logo_black-scaled" -> "Vammo"
const fileName = (file: string) => titled(file.split(/[-_\s]+/).filter((w) => w && !FILE_NOISE.test(w)));

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const exitsAt = html.search(EXITS);
	const currentAt = html.search(CURRENT);
	if (exitsAt < 0 && currentAt < 0) {
		throw new Error('ecosystemintegrity: neither portfolio heading is on the page — the markup moved');
	}
	const gridAt = Math.min(...[exitsAt, currentAt].filter((at) => at >= 0));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	LOGO.lastIndex = gridAt;
	for (let m = LOGO.exec(html); m; m = LOGO.exec(html)) {
		const [, id, src] = m;
		// a logo between the exits' heading and the companies' is an exit
		const exited = exitsAt >= 0 && m.index > exitsAt && (currentAt < exitsAt || m.index < currentAt);

		const start = html.indexOf(`id="overlay-describedby-${id}"`);
		const end = start < 0 ? -1 : html.indexOf(POPUP_END, start);
		const popup = start < 0 ? '' : html.slice(start, end < 0 ? undefined : end);
		const address = [...popup.matchAll(ADDRESS)].map(([, href]) => unescape(href)).find((href) => {
			const host = hostOf(href);
			return host && !OWN_SITE.test(host);
		});
		const host = address ? hostOf(address) : '';
		const file = fileOf(unescape(src));
		const name = NAMES[host] ?? NAMES[file] ?? (host ? domainName(host) : fileName(file));
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const lead = clean(popup.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? '');
		const buyer = exited ? lead.match(SOLD)?.[1]?.trim() : '';
		companies.push({
			name,
			category: [buyer ? `Acquired by ${tag(buyer)}` : '', exited ? 'Exited' : ''].filter(Boolean).join(', '),
			url: address ?? PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('ecosystemintegrity: no logos under the portfolio headings — the markup moved');
	}

	return companies;
}
