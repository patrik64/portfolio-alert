import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://future.ventures/investments';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: two galleries of logos, with no captions and alt text that is
// only the image's file name. the first is the current portfolio; the second,
// under "each logo below links to a founding story", is the partners' earlier
// founding investments (tesla, skype, hotmail…), kept as previous
// investments. many logos link not to the company but to a photo, a post or a
// news story about it, so a company is known by the address it links to when
// that is its own, and otherwise by its logo's file, under the name it gives
// itself, looked up once; one missing from the lists is named after its
// address, or failing that its file, until it is added. an exit is a badge
// drawn into the logo, and the files say which: "…with ipo bug",
// "mosaicMA_bug", "planetIPO".
const NAMES: Record<string, string> = {
	'64xbio.com': '64x Bio',
	'alicetechnologies.com': 'Alice Technologies',
	'ambrosia.energy': 'Ambrosia',
	'amplifier-tx.com': 'Amplifier Therapeutics',
	'astonishinglabs.com': 'Astonishing Labs',
	'atai.life': 'atai Life Sciences',
	'beeflow.com': 'Beeflow',
	'bmcingredients.com': 'BMC Ingredients',
	'cambrianbio.com': 'Cambrian Bio',
	'centivax.com': 'Centivax',
	'coperniccatalysts.com': 'Copernic Catalysts',
	'deepgenomics.com': 'Deep Genomics',
	'earthshot.eco': 'Earthshot Labs',
	'enriched.ag': 'Enriched Ag',
	'faeththerapeutics.com': 'Faeth Therapeutics',
	'gametogen.com': 'Gameto',
	'gaussion.com': 'Gaussion',
	'glass-imaging.com': 'Glass Imaging',
	'greenlightbiosciences.com': 'GreenLight Biosciences',
	'hephaeet.com': 'Hephae',
	'humcapital.com': 'Hum Capital',
	'kindbiotechnology.com': 'Kind Biotechnology',
	'lacelithography.com': 'Lace Lithography',
	'latentai.com': 'Latent AI',
	'modulate.ai': 'Modulate',
	'mojo.vision': 'Mojo Vision',
	'moltensaltsolutions.com': 'Molten Salt Solutions',
	'mosaicml.com': 'MosaicML',
	'neurobionics.io': 'NeuroBionics',
	'opentrons.com': 'Opentrons',
	'outcomemd.com': 'OutcomeMD',
	'pumpkinseed.bio': 'Pumpkinseed',
	'redmetals.com': 'Red Metals',
	'robust.ai': 'Robust AI',
	'scienft.com': 'ScieNFT',
	'senseibio.com': 'Sensei Bio',
	'shennonbio.com': 'Shennon Biotechnologies',
	'stardust-initiative.com': 'Stardust',
	'subcritical.com': 'Subcritical Systems',
	'upsidefoods.com': 'Upside Foods',
	'verdantrobotics.com': 'Verdant Robotics',
	'x.ai': 'xAI',
	'yourchoicetx.com': 'YourChoice Therapeutics',
	'zainartech.com': 'ZaiNar',
	'zyphra.com': 'Zyphra'
};

// the logos linking elsewhere, by their files: "The+Boring+Company.png"
const FILES: Record<string, string> = {
	'cfs-logo': 'Commonwealth Fusion Systems',
	'cyras': 'Cyras Systems',
	'decibel-removebg-preview': 'Decibel',
	'dwaveipo': 'D-Wave',
	'everspin': 'Everspin',
	'hotmail': 'Hotmail',
	'interwoven': 'Interwoven',
	'kana': 'Kana',
	'moonwalk_logo-removebg-preview-2': 'Moonwalk Biosciences',
	'mythic-ai': 'Mythic',
	'neophotonics': 'NeoPhotonics',
	'nervana': 'Nervana',
	'neuralink': 'Neuralink',
	'new_culture_logo_stacked_pink': 'New Culture',
	'osmind_rgb_transv2': 'Osmind',
	'planetipo': 'Planet',
	'prellis bio_2024-0906-cropped': 'Prellis Biologics',
	'realta_2025-08-25_17.00.42-removebg-preview': 'Realta Fusion',
	'sanmai-removebg': 'Sanmai',
	'skype': 'Skype',
	'spacex': 'SpaceX',
	'sphere-removebg': 'Sphere Semi',
	'sublinear_sj temp_v3': 'Sublinear Systems',
	'sutro': 'Sutro Biopharma',
	'tesla': 'Tesla',
	'the boring company': 'The Boring Company',
	'tradex': 'Tradex',
	'unconventional_2025-1118-cropped-removebg': 'Unconventional AI',
	'vironexis_2024-0903-removebg': 'Vironexis Biotherapeutics',
	'woola_must_vaike': 'Woola',
	'xona_2025-11-05-removebg': 'Xona Space Systems',
	'xtime': 'Xtime',
	'zoox': 'Zoox'
};

// addresses that are about a company rather than its own
const ELSEWHERE = [
	'flickr.com',
	'flic.kr',
	'x.com',
	'twitter.com',
	'techcrunch.com',
	'wsj.com',
	'marketwatch.com',
	'informationweek.com',
	'semanticscholar.org',
	'optics.org',
	'linkedin.com',
	'medium.com',
	'youtube.com'
];

const GALLERY = /<div class="sqs-gallery">/;
const SLIDE = /(?=<div class="slide")/;
const LINK = /<a\b[^>]*\bhref="([^"]+)"/;
const FILE = /\bdata-src="([^"]+)"/;
// the badge drawn into a logo, as its file names it
const IPO = /IPO|\bipo\s+bug\b/;
const ACQUIRED = /MA_bug|\bma\s+bug\b/;
const STEALTH = /^stealth\b/i;

const DECORATION = ['goto', 'get', 'try', 'use', 'join', 'with', 'go', 'my'];
const SUBDOMAIN = /^(www|en|de|fr|es|it|pt|nl|uk|us|app)$/i;
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;
const MIN_BRAND = 3;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const hostOf = (url: string) => {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
	} catch {
		return '';
	}
};

const titled = (s: string) =>
	s
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');

// "getfoo.com" -> "Foo", "ark-climate.de" -> "Ark Climate"
function domainName(host: string): string {
	const parts = host.split('.').filter((part) => !SUBDOMAIN.test(part));
	let label =
		parts.length >= 3 && SUFFIX.test(parts[parts.length - 2])
			? parts[parts.length - 3]
			: (parts[parts.length - 2] ?? parts[0] ?? '');
	const bare = DECORATION.find((d) => label.startsWith(d) && label.length - d.length >= MIN_BRAND);
	if (bare) label = label.slice(bare.length);
	return titled(label.replace(/-/g, ' '));
}

// "The+Boring+Company.png" -> "The Boring Company"
const fileOf = (src: string) =>
	decodeURIComponent(src.split('?')[0].split('/').pop() ?? '')
		.replace(/\+/g, ' ')
		.replace(/\.\w+$/, '')
		.trim();

// a file's name with the upload's leftovers taken off, for a logo not yet
// listed: "Xona_2025-11-05-removebg" -> "Xona"
const fileName = (file: string) =>
	titled(
		file
			.replace(/[_\s-]*20\d\d[-_\s.\d]*/g, ' ')
			.replace(/-?removebg(-preview)?(-\d+)?/gi, ' ')
			.replace(/\b(logo|cropped|transparent|final|new|copy|bug|ipo|ma)\b/gi, ' ')
			.replace(/[_-]+/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
	);

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const galleries = html.split(GALLERY).slice(1);
	if (galleries.length === 0) {
		throw new Error('futureventures: no logo galleries on the investments page');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	galleries.forEach((gallery, index) => {
		for (const slide of gallery.split(SLIDE).slice(1)) {
			const link = unescape(slide.match(LINK)?.[1] ?? '');
			const host = hostOf(link);
			const own = host && !ELSEWHERE.some((h) => host === h || host.endsWith(`.${h}`));
			const file = fileOf(slide.match(FILE)?.[1] ?? '');
			const name =
				(own ? NAMES[host] : undefined) ??
				FILES[file.toLowerCase()] ??
				(own ? domainName(host) : fileName(file));
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const outcome = IPO.test(file) ? 'IPO' : ACQUIRED.test(file) ? 'Acquired' : '';
			companies.push({
				name,
				category: [index > 0 ? 'Previous investment' : '', outcome, outcome ? 'Exited' : '']
					.filter(Boolean)
					.join(', '),
				// a photo, a post or a story, where that is what the logo links
				url: /^https?:\/\//.test(link) ? link : ''
			});
		}
	});

	if (companies.length === 0) {
		throw new Error('futureventures: no logos in the investments galleries');
	}

	return companies;
}
