import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.breadandbutterventures.com/portfolio-companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page is one collection list, a company a card
// whose logo is its background image and which links the company's site.
// not a name is written, and the logos' files are no guide — several were
// made from one template and keep its name ("Orbiit.png" is rentgrata's,
// "Structural.png" is bybe's) — so the names are kept here, keyed on the
// address a card links, as the companies call themselves. an address not
// listed here still imports, named after itself the way the other
// domain-named scrapers do it, until it is added.
const NAMES: Record<string, string> = {
	'backhouseshop.com': 'Backhouse',
	'betterleave.com': 'Betterleave',
	'bettermynd.com': 'BetterMynd',
	'bizzycoffee.com': 'Bizzy Coffee',
	'bridgemoney.co': 'Bridge',
	'bybe.com': 'BYBE',
	'carbonorigins.com': 'Carbon Origins',
	'championhq.com': 'Champion',
	'cherryblossomintimates.com': 'Cherry Blossom Intimates',
	'cleancroptech.com': 'Clean Crop Technologies',
	'conversight.ai': 'ConverSight',
	'delfina.com': 'Delfina',
	'dispatchgoods.com': 'Dispatch Goods',
	'earthsense.co': 'EarthSense',
	'eatfaceplant.com': 'Face Plant',
	'extemporeapp.com': 'Extempore',
	'firstbite.io': 'First Bite',
	'fulcrumpro.com': 'Fulcrum',
	'gabbi.com': 'Gabbi',
	'gencove.com': 'Gencove',
	'getsocialcrowd.com': 'SocialCrowd',
	'goknit.com': 'Knit',
	'gudea.ai': 'Gudea',
	'heavyconnect.com': 'HeavyConnect',
	'helloriver.com': 'River Health',
	'intellectible.com': 'Intellectible',
	'itilitihealth.com': 'Itiliti Health',
	'joincaddy.com': 'Caddy',
	'lyco.ai': 'Lyco',
	'milkmoovement.com': 'Milk Moovement',
	'nestcollaborative.com': 'Nest Collaborative',
	'nimblemind.ai': 'Nimblemind',
	'omniafishing.com': 'Omnia Fishing',
	'optionsmd.com': 'Options MD',
	'orbiit.ai': 'Orbiit',
	'overhyped.ai': 'Overhyped AI',
	'parentoleave.com': 'Parento',
	'pluralpolicy.com': 'Plural',
	'projectadmission.com': 'Project Admission',
	'renewalmill.com': 'Renewal Mill',
	'rentgrata.com': 'Rentgrata',
	'salmonrun.ai': 'Salmon',
	'scienceoncall.com': 'Science On Call',
	'snoutid.com': 'SnoutID',
	'spoonshot.com': 'Spoonshot',
	'squarepeghires.com': 'SquarePeg',
	'stopwatch.tech': 'Stopwatch',
	'structural.com': 'Structural',
	'summersalt.com': 'Summersalt',
	'techmate.com': 'Techmate',
	'tenderfood.com': 'Tender Food',
	'tendrel.io': 'Tendrel',
	'toolsvilla.com': 'Toolsvilla',
	'tradelanes.co': 'TradeLanes',
	'tradeverifyd.com': 'Tradeverifyd',
	'traivefinance.com': 'Traive',
	'tryhungry.com': 'Hungry',
	'upsie.com': 'Upsie',
	'voicecare.ai': 'VoiceCare AI',
	'wearechiyo.com': 'Chiyo',
	'whitebalance.co': 'Whitebalance',
	'xmode.io': 'X-Mode',
	'xrobotics.io': 'XRobotics',
	'yourpathhealth.org': 'YourPath'
};

// the companies the fund is out of: their logos have "ACQUIRED" drawn in
// under them, and nothing else on the page says so
const EXITS = new Set(['bybe.com', 'orbiit.ai', 'rentgrata.com', 'structural.com', 'wearechiyo.com', 'xmode.io']);

const CARD = /<div\b[^>]*\bclass="collection-item w-dyn-item"[^>]*>\s*<a\b([^>]*)>/g;
const HREF = /\bhref="([^"]*)"/;
const STEALTH = /^stealth\b/i;

const DECORATION = ['goto', 'get', 'try', 'use', 'join', 'with', 'go', 'my'];
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

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, attributes] of html.matchAll(CARD)) {
		const site = (attributes.match(HREF)?.[1] ?? '').replace(/&amp;/g, '&').trim();
		const host = /^https?:\/\//i.test(site) ? hostOf(site) : '';
		const name = host ? (NAMES[host] ?? domainName(host)) : '';
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: EXITS.has(host) ? 'Exited' : '', url: site });
	}
	if (companies.length === 0) {
		throw new Error('breadandbutter: no companies on the portfolio page');
	}

	return companies;
}
