import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.breaktrailventures.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace, the whole site one page: the portfolio is a gallery in its
// "Portfolio" section, a square logo a company, all but three linking the
// company's site. not a name is written — the images' alt text is only
// their files' names, "Whitagram-Image 5.JPG" and "IMG_5728.jpg" — so the
// names are kept here, keyed on the address a logo links, as the companies
// call themselves; the three logos that link nowhere are kept by their
// images. an address not listed here still imports, named after itself the
// way the other domain-named scrapers do it, until it is added; an unlinked
// image not listed is left out.
const NAMES: Record<string, string> = {
	'after.com': 'After',
	'bandwango.com': 'Bandwango',
	'biofire.io': 'Biofire',
	'channelape.com': 'ChannelApe',
	'cognovilabs.com': 'Cognovi Labs',
	'cotopaxi.com': 'Cotopaxi',
	'deathclock.co': 'Death Clock',
	'drinkcusa.com': 'Cusa Tea & Coffee',
	'expectful.com': 'Expectful',
	'fitlab.com': 'FitLab',
	'francesvalentine.com': 'Frances Valentine',
	'freaksofnature.com': 'Freaks of Nature',
	'frontsightmedia.com': 'Frontsight Media',
	'getbaseline.com': 'Baseline',
	'getmixxy.com': 'Mixxy',
	'getrepeat.io': 'Repeat',
	'getsett.co': 'Sett',
	'glidance.io': 'Glidance',
	'goauntflow.com': 'Aunt Flow',
	'godmodebeauty.com': 'Godmode Beauty',
	'gopreem.com': 'Preem',
	'guesthouseshop.com': 'Guest House',
	'halfdays.com': 'Halfdays',
	'hammerspace.com': 'Hammerspace',
	'harpersystems.dev': 'Harper',
	'heli.life': 'Heli',
	'janji.com': 'Janji',
	'kickfurther.com': 'Kickfurther',
	'kinderfarms.com': 'KinderFarms',
	'livefrey.com': 'Frey',
	'livemomentous.com': 'Momentous',
	'monicaandandy.com': 'Monica + Andy',
	'moveeasy.com': 'MoveEasy',
	'nikola.tech': 'Nikola Labs',
	// sseko designs' logo links the company that bought it
	'noondaycollection.com': 'Sseko Designs',
	'oiselle.com': 'Oiselle',
	'orionsleep.com': 'Orion Sleep',
	'paireyewear.com': 'Pair Eyewear',
	'planaformen.com': 'Plan A',
	'premiumsfortheplanet.com': 'Premiums for the Planet',
	'quantifyfundsetfs.com': 'Quantify Funds',
	'ridewithshare.com': 'Share',
	'seamless.ai': 'Seamless.AI',
	'shinesty.com': 'Shinesty',
	'shotzr.com': 'Shotzr',
	'silvertonmountain.com': 'Silverton Mountain',
	'smartplanai.com': 'SmartPlan AI',
	'snobahn.com': 'Snöbahn',
	'solarcore.tech': 'Solarcore',
	'spintechllc.com': 'Spintech',
	'standshoes.com': 'STAND+',
	'takethesis.com': 'Thesis',
	'thesweetspot.com': 'The Sweet Spot',
	'timedochealth.com': 'TimeDoc Health',
	'trypura.com': 'Pura',
	'variant3d.io': 'Variant3D',
	'wearpepper.com': 'Pepper',
	'weareuni.com': 'Uni',
	'wednesdaytalent.com': 'Wednesday',
	'westernrise.com': 'Western Rise',
	'withalthea.com': 'Althea'
};

// the logos that link nowhere, by their images
const IMAGES: Record<string, string> = {
	'628cfe6ce7613555352286ac': 'Most Days',
	'6102d973600d630b7de3de14': 'Pattern89',
	'646e97d37d796d72881ba856': 'Spark Grills'
};

// the companies the fund is out of, which say so in small print drawn under
// their logos: how it went, or only "Exited" — by address, or by image for
// the unlinked ones
const EXITS: Record<string, string> = {
	'drinkcusa.com': 'Acquired by Wild Zora',
	'expectful.com': 'Acquired by Babylist',
	'getrepeat.io': 'Acquired by WeCommerce',
	'livefrey.com': 'Acquired by Square M Acquisitions',
	'noondaycollection.com': 'Acquired by Noonday Collection',
	'shotzr.com': 'Acquired by Shutterstock',
	'timedochealth.com': '',
	'6102d973600d630b7de3de14': 'Acquired by Shutterstock',
	'646e97d37d796d72881ba856': 'Acquired by Charbroil'
};

const SLIDE = /(?=<div class="slide" data-type="image")/;
// the anchor's attributes are spread over lines, so the href is found
// anywhere inside its tag; an unlinked logo's anchor has none
const HREF = /<a\b[^>]*?\bhref="([^"]*)"/;
const IMAGE_ID = /\bdata-image-id="([^"]+)"/;
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
	for (const chunk of html.split(SLIDE).slice(1)) {
		// the last slide runs on to the end of the page, so each is cut at its anchor's close
		const slide = chunk.slice(0, chunk.indexOf('</a>') + 1 || undefined);
		const site = (slide.match(HREF)?.[1] ?? '').replace(/&amp;/g, '&').trim();
		const host = /^https?:\/\//i.test(site) ? hostOf(site) : '';
		const image = host ? '' : (slide.match(IMAGE_ID)?.[1] ?? '');
		const name = host ? (NAMES[host] ?? domainName(host)) : (IMAGES[image] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const exit = EXITS[host || image];
		companies.push({
			name,
			category: exit === undefined ? '' : [exit, 'Exited'].filter(Boolean).join(', '),
			url: host ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('breaktrail: no companies in the portfolio gallery');
	}

	return companies;
}
