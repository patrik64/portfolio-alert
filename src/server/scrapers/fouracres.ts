import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.fouracres.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: two galleries of logos, under "Four Acres Portfolio" and
// "Legacy Portfolio" — the companies of the fund before this one, kept with
// those words — each logo linking the company's site, the image files named
// for whatever took them ("IMG_6602.JPG") and the alt text the file's name.
// no name is written anywhere but in the logos, so a company is known by the
// address it links to, under the name it gives itself, looked up once; one
// missing from the list is named after its address until it is added. a
// logo that links nowhere is known by its image file instead, and a caption
// ("*sourced by Flatiron Investors") is kept as a note.
const NAMES: Record<string, string> = {
	'accruesavings.com': 'Accrue',
	'airship.us': 'Airship',
	'allocate.co': 'Allocate',
	'anterior.com': 'Anterior',
	'archlending.com': 'Arch',
	'aryahealth.ai': 'Arya Health',
	'aspireship.com': 'Aspireship',
	'assorthealth.com': 'Assort Health',
	'baselayerhq.com': 'Baselayer',
	'bbot.menu': 'Bbot',
	'bostongeospatial.com': 'Boston Geospatial',
	'braze.com': 'Braze',
	'byhumankind.com': 'by Humankind',
	'callhyper.com': 'Hyper',
	'channelape.com': 'ChannelApe',
	'civcheck.ai': 'CivCheck',
	'credijusto.com': 'Credijusto',
	'deepscribe.ai': 'DeepScribe',
	'electric.ai': 'Electric',
	'expent.ai': 'Expent',
	'fertilidad.com': 'Fertilidad Integral',
	'flexbase.app': 'Flexbase',
	'ghst.io': 'Ghost',
	'habi.co': 'Habi',
	'hipp.health': 'Hipp Health',
	'home.tomorrowhealth.com': 'Tomorrow Health',
	'ideaflow.io': 'Ideaflow',
	'indie.health': 'Indie Health',
	'integrated-projects.com': 'IPX',
	'joinnimbus.com': 'Nimbus Health',
	'kingdomsupercultures.com': 'Kingdom Supercultures',
	'knotapi.com': 'Knot',
	'koodos.com': 'Koodos',
	'levelshealth.com': 'Levels',
	'lilohotelsupplies.com': 'Lilo',
	'markos.ai': 'MarkOS',
	'maxhome.ai': 'MaxHome',
	'meetnirvana.com': 'Nirvana Health',
	'mia.inc': 'Mia',
	'mindbloom.com': 'Mindbloom',
	'myturnout.com': 'Turnout',
	'ontop.ai': 'Ontop',
	'ophelia.com': 'Ophelia',
	'pandohr.com': 'Pando',
	'parallelmarkets.com': 'Parallel Markets',
	'passportshipping.com': 'Passport',
	'rarecircles.com': 'RareCircles',
	'reffie.me': 'Reffie',
	'risingteam.com': 'Rising Team',
	'sellscale.com': 'SellScale',
	'senken.io': 'Senken',
	'shabodi.com': 'Shabodi',
	'sheerhealth.com': 'Sheer Health',
	'sparkplug.app': 'SparkPlug',
	'subject.com': 'Subject',
	'thebuilder.ai': 'TheBuilder.ai',
	'theoai.ai': 'Theo AI',
	'trigodata.com': 'Trigo',
	'truefootage.tech': 'True Footage',
	'tryprocode.com': 'Procode',
	'trywalnut.com': 'Walnut',
	'verbenergy.co': 'Verb Energy',
	'voiceops.com': 'Voiceops',
	'wallaroo.ai': 'Wallaroo.AI'
};

// logos that link nowhere, by their image file
const FILES: Record<string, string> = {
	'collage_export_e645b319-3816-4e76-858d-032a3c9e7a87': 'Bitewing AI'
};

const SECTION = /(?=<section\b[^>]*\bdata-section-id)/;
const ITEM = /(?=<figure class="gallery-grid-item\b)/;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const FILE = /<img\b[^>]*\bdata-src="([^"]+)"/;
const CAPTION = /<figcaption\b[\s\S]*?<\/figcaption>/;
const HEADING = /<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/;
const LEGACY = /\blegacy\b/i;

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

// the category is comma-joined, so a note holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

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

// "…/collage_export_E645B319-….JPG" -> "collage_export_e645b319-…"
const fileKey = (src: string) =>
	decodeURIComponent(src.split('?')[0].split('/').pop() ?? '')
		.replace(/\.\w+$/, '')
		.toLowerCase();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	// a gallery takes the heading of the section above it
	let heading = '';
	for (const section of html.split(SECTION).slice(1)) {
		const items = section.split(ITEM).slice(1);
		if (items.length === 0) {
			const title = clean(section.match(HEADING)?.[1] ?? '');
			if (title) heading = title;
			continue;
		}
		for (const chunk of items) {
			const item = chunk.split('</figure>')[0];
			const url = unescape(item.match(LINK)?.[1] ?? '');
			const host = hostOf(url);
			const name = host
				? (NAMES[host] ?? domainName(host))
				: (FILES[fileKey(item.match(FILE)?.[1] ?? '')] ?? '');
			if (!name || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const caption = tag(clean(item.match(CAPTION)?.[0] ?? '').replace(/^\*+\s*/, ''));
			companies.push({
				name,
				category: [
					LEGACY.test(heading) ? 'Legacy portfolio' : '',
					caption ? caption[0].toUpperCase() + caption.slice(1) : ''
				]
					.filter(Boolean)
					.join(', '),
				url
			});
		}
	}

	if (companies.length === 0) {
		throw new Error('fouracres: no logos on the portfolio page');
	}

	return companies;
}
