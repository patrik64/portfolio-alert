import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://citylight.vc/portfolio/';
// siteground's firewall answers 403 to chrome user-agent strings, as it does
// for clocktower, cortical, helios and stray dog, and lets through a
// request that says plainly who is asking: so this one does, and wears
// nothing else. an address the firewall distrusts gets its captcha page
// whatever it says, and then the run fails saying so
const UA = 'portfolio-alert/1.0 (+https://portfolio-alert.vercel.app)';

// wordpress with elementor, the grid drawn by a shortcode of the theme's:
// every company is a logo linking its site, turning over to a line about
// it, and carries as data the sectors and themes the filters read
// ("care telehealth-2-0") and its status, "active" or "alumni". an alumnus
// is an exit, and most say how it went on the logo's corner ("Acquired by:
// Peloton", "IPO Nasdaq: TWOU"). only the sectors ("Care", "Climate",
// "Education") are spelled out on the page, so only they are kept.
//
// not a name is written: the logos are background images. but their files
// are named for the companies ("logo-carbon-counts.png"), which spells most
// names out once the dressing is taken off; the ones it does not spell
// right are listed here. a company bought sometimes links its buyer (Bright
// Parenting links Maven, which is in the portfolio too), so a logo is known
// by its file and not by the address it links.
const NAMES: Record<string, string> = {
	gingerio: 'Ginger',
	'logo-2u-1': '2U',
	'logo-abgelq': 'AngelQ',
	'logo-aloecare': 'Aloe Care Health',
	'logo-ansel': 'Ansel Health',
	'logo-arcadia-power': 'Arcadia',
	'logo-auxira': 'Auxira Health',
	'logo-banyan-1': 'Banyan Infrastructure',
	'logo-bicyclehealth-1': 'Bicycle Health',
	'logo-boodlebox': 'BoodleBox',
	'logo-brave': 'Brave Health',
	'logo-brightparenting': 'Bright Parenting',
	'logo-collahealth': 'Colla Health',
	'logo-commsafe': 'CommSafe',
	'logo-daisy-chain': 'DaisyChain Energy',
	'logo-defiant': 'Defiant Health',
	'logo-elektrahealth': 'Elektra Health',
	'logo-ellipsis': 'Ellipsis Health',
	'logo-elroyair': 'Elroy Air',
	'logo-everydaylabs': 'EveryDay Labs',
	'logo-flourish': 'Flourish Health',
	'logo-goal-ai': 'Goal AI',
	'logo-gratia': 'Gratia Health',
	'logo-hyggepower': 'Hygge Power',
	'logo-ilant': 'Ilant Health',
	'logo-jimini': 'Jimini Health',
	'logo-karuna': 'Karuna Labs',
	'logo-kineticeye-1': 'Kinetic Eye',
	'logo-legendsoflearning': 'Legends of Learning',
	'logo-lgnd': 'LGND',
	'logo-lilac': 'Lilac Software',
	'logo-limeloop-1': 'LimeLoop',
	'logo-livesafe': 'LiveSafe',
	'logo-maven': 'Maven Clinic',
	'logo-midihealth': 'Midi Health',
	'logo-monami': 'Mon Ami',
	'logo-movido': 'Movido Health',
	'logo-mylaurel': 'myLaurel',
	'logo-neuronav': 'NeuroNav',
	'logo-neurovitals': 'NeuroVitals',
	'logo-noteworthyai': 'Noteworthy AI',
	'logo-ohm-ev': 'OhmNow',
	'logo-ohmconnect': 'OhmConnect',
	'logo-ohmnidian': 'Omnidian',
	'logo-packagefree-1': 'Package Free',
	'logo-pila': 'Pila Energy',
	'logo-planetfwd': 'Planet FWD',
	'logo-poppyseed': 'Poppy Seed Health',
	'logo-prax': 'Prax Health',
	'logo-precursor': 'Precursor SPC',
	'logo-pym': 'PYM',
	'logo-radai': 'Rad AI',
	'logo-rapidsos': 'RapidSOS',
	'logo-realized': 'Realized Care',
	'logo-ripplcare': 'Rippl',
	'logo-rovr': 'RoVR',
	'logo-rune': 'Rune Labs',
	'logo-safetraces-1': 'SafeTraces',
	'logo-salvo': 'Salvo Health',
	'logo-shotspotter': 'ShotSpotter',
	'logo-skyward': 'Skyward Wildfire',
	'logo-spark': 'Spark Pediatrics',
	'logo-squareroots': 'Square Roots',
	'logo-straighterline': 'StraighterLine',
	'logo-svacademy': 'SV Academy',
	'logo-talktomira': 'Mira',
	'logo-tembohealth': 'Tembo Health',
	'logo-tenyour': 'TenYour',
	'logo-terabase-1': 'Terabase Energy',
	'logo-terrado': 'Terra.do',
	'logo-thrive-1': 'Thrive Health Tech',
	'logo-trilogy-1': 'Trilogy Education',
	'logo-watt-carbon': 'WattCarbon',
	'logo-wch': 'World Class Health',
	'logo-xage': 'Xage Security'
};

const ITEM = /(?=<li\b[^>]*\bclass="company filter-item\b)/;
const DATA = /^<li\b[^>]*\bdata-company-categories="([^"]*)"/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
const LOGO = /class="card--logo"[^>]*\bbackground-image:\s*url\(([^)]+)\)/;
const NOTES = /class="card--notes"[^>]*>([\s\S]*?)<\/div>/;
// a sector filter: the slug the companies carry, and how it is spelled out
const SECTOR = /\bdata-company-category="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
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

// "…/logo-carbon-counts.png" -> "logo-carbon-counts"
const fileOf = (src: string) =>
	decodeURIComponent(src.replace(/["']/g, '').split(/[?#]/)[0].split('/').pop() ?? '').replace(/\.\w+$/, '');

// "logo-carbon-counts" -> "Carbon Counts", "logo-arbor-1" -> "Arbor"
const spelled = (file: string) =>
	file
		.replace(/^logo-/i, '')
		.replace(/-logo$/i, '')
		.replace(/-\d+$/, '')
		.split(/[-_]+/)
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');

// "Acquired by: Peloton" -> "Acquired by Peloton", "IPO Nasdaq: TWOU" -> "IPO (Nasdaq: TWOU)"
function outcome(note: string): string {
	const said = note.match(/^(acquired by|merged with):?\s*(.+)$/i);
	if (said) return `${said[1].charAt(0).toUpperCase()}${said[1].slice(1).toLowerCase()} ${said[2]}`;
	const listed = note.match(/^ipo\b\s*(.*)$/i);
	if (listed) return listed[1] ? `IPO (${listed[1]})` : 'IPO';
	return note;
}

// an answer that is the site's, or an error saying what the firewall said
async function get(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	const body = await resp.text();
	if (resp.ok && resp.status !== 202 && !/sgcaptcha/i.test(body)) return body;
	const title = clean(body.match(/<title[^>]*>([^<]*)</)?.[1] ?? '');
	throw new Error(
		`citylight: ${url} answered ${resp.status}${title ? ` "${title}"` : ''}` +
			(/sgcaptcha/i.test(body) ? ", siteground's captcha" : '')
	);
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await get(PAGE_URL);
	const sectors = new Map([...html.matchAll(SECTOR)].map(([, slug, label]) => [slug, tag(label)]));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const chunk of html.split(ITEM).slice(1)) {
		const item = chunk.slice(0, chunk.indexOf('</li>') + 1 || undefined);
		const file = fileOf(unescape(item.match(LOGO)?.[1] ?? ''));
		const name = NAMES[file] ?? spelled(file);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const data = (item.match(DATA)?.[1] ?? '').split(/\s+/);
		const note = outcome(tag(item.match(NOTES)?.[1] ?? ''));
		// a few still filed as active say on the corner that they were sold
		const exited = data.includes('alumni') || /^(acquired|merged|ipo)\b/i.test(note);
		const site = unescape(item.match(LINK)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [...data.map((slug) => sectors.get(slug) ?? ''), note, exited ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('citylight: no companies on the portfolio page');
	}

	return companies;
}
