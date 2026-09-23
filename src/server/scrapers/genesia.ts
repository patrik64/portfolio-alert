import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.genesiaventures.com/en/partners/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the "companies" page holds two walls of
// logos — the limited partners, which are left out, and the startups — each
// logo opening a popup with a line about the company, the country it works
// in and the fund it came from ("GV-3"), and its service and corporate sites.
// the popup's title is left empty in both languages and the logos carry no
// alt text, so no name is written anywhere but in the logos: a company is
// known by the site it links to, under the name it gives itself, looked up
// once; one missing from the list is named after its address until it is
// added. a company with no site left is known by its logo's file instead,
// and one whose file names nothing is passed over until it is listed. "Sea"
// is the site's shorthand for southeast asia.
const NAMES: Record<string, string> = {
	'24hmoney.vn': '24HMoney',
	'52japan.com': 'Linc',
	'acbiode.com': 'AC Biode',
	'aerial-p.com': 'Aerial Partners',
	'ai-mage.jp': 'AI Mage',
	'ailead.app': 'ailead',
	'airboxr.com': 'Airboxr',
	'aitravel.cloud': 'AI Travel',
	'aki-katsu.co.jp': 'Akikatsu',
	'albatross-technology.com': 'Albatross Technology',
	'almure.io': 'Almure',
	'amoibeojt.jp': 'amoibe',
	'amplified.ai': 'Amplified',
	'amptalk.co.jp': 'amptalk',
	'appdate.co.jp': 'Appdate',
	'athearth.com': 'AtHearth',
	'autify.com': 'Autify',
	'b-eff.com': 'Beff',
	'baniql.com': 'BANIQL',
	'beepbeepmart.com': 'BeepBeep',
	'biz.conct.jp': 'CO-NECT',
	'bluebank.app': 'BlueBank',
	'bobobox.co.id': 'Bobobox',
	'boosthealth.jp': 'Boost Health',
	'buddycompass.com': 'BuddyCompass',
	'care-space.jp': 'CareSpace',
	'chanpro.jp': 'Chanpro',
	'chemican.net': 'Chemican',
	'colorsing.com': 'ColorSing',
	'company.baseconnect.in': 'Baseconnect',
	'congrant.com': 'Congrant',
	'connectafya.com': 'Connect Afya',
	'conojuku.co': 'conocer',
	'conoris.jp': 'Conoris',
	'corp.acall.jp': 'Acall',
	'corp.ecrowd.co.jp': 'eCrowd',
	'crowdloan.jp': 'Crowdloan',
	'digdig.jp': 'digdig',
	'dimension4.dev': 'Dimension4',
	'docquity.com': 'Docquity',
	'dodoai.ai': 'dodoAI',
	'dotsfty.com': '.sfty',
	'edoctor.io': 'eDoctor',
	'eitoss.com': 'Eitoss',
	'elevation-space.com': 'ElevationSpace',
	'enerbank.co.jp': 'Enerbank',
	'entaar.com': 'Entaar',
	'farmako.in': 'Farmako',
	'fastlabel.ai': 'FastLabel',
	'finantier.co': 'Finantier',
	'finovo.co.jp': 'Finovo',
	'foods.petokoto.com': 'PETOKOTO',
	'formx.co.jp': 'FormX',
	'friendmicrobe.co.jp': 'Friend Microbe',
	'fundiin.vn': 'Fundiin',
	'funfo.jp': 'funfo',
	'furmeture.com': 'FURMETURE',
	'gaxi.jp': 'Gaxi',
	'geologic.co.jp': 'GeoLogic',
	'get-canvas.com': 'canvas',
	'greenfile.work': 'Greenfile.work',
	'hix-selfcheck.com': 'HIX',
	'hokuto.app': 'HOKUTO',
	'holo-bio.com': 'HOLOBIO',
	'homedy.com': 'Homedy',
	'hrbase.jp': 'HRbase',
	'hrbrain.jp': 'HRBrain',
	'ieuri.com': 'Ieuri',
	'insightx.tech': 'InsightX',
	'jiffcy.com': 'Jiffcy',
	'jobrainbow.net': 'JobRainbow',
	'jp.umamiunited.com': 'UMAMI UNITED',
	'jungle.xyz': 'JungleX',
	'kamereo.vn': 'Kamereo',
	'kasagilabo.com': 'Kasagi Labo',
	'kini-sh.com': 'Kinish',
	'lala-corporation.co.jp': 'Lala Corporation',
	'leeep.jp': 'LEEEP',
	'liberont.com': 'Liberont',
	'life-q.jp': 'Life Quest',
	'lipronext.com': 'Lipronext',
	'logikura.jp': 'Logikura',
	'logipeace.com': 'Logipeace',
	'logisly.com': 'Logisly',
	'logpose.co.jp': 'Logpose Technologies',
	'lp.pecotter.jp': 'Bright Table',
	'lp.salesnavi.co.jp': 'Sales Navi',
	'lp.smartrial.jp': 'SmarTrial',
	'luxstay.com': 'Luxstay',
	'malead.co.jp': 'M&A Lead',
	'malme.net': 'Malme',
	'manabie.com': 'Manabie',
	'medeta.co.jp': 'medeta',
	'meetscare.jp': 'meetscare',
	'mentemo.com': 'Mentemo',
	'metasensing.co.jp': 'MetaSensing',
	'microverse.co.jp': 'microverse',
	'mierba.com': 'Mierba',
	'mii-bio.com': 'Mii Bio',
	'miive.jp': 'miive',
	'miresso.co.jp': 'MiRESSO',
	'mo-vus.com': 'movus',
	'mokable.jp': 'MOKABLE',
	'moneyduck.com': 'Moneyduck',
	'mosh.jp': 'MOSH',
	'mvillage.vn': 'Modern Village',
	'nanofrontier.jp': 'NanoFrontier',
	'nappy.jp': 'Napps',
	'neulo.com': 'NEULO',
	'nicola-inc.co.jp': 'NiCOLA',
	'nomino-yourtrade.com': 'YourTrade',
	'nomu.co.jp': 'nomu',
	'nonat-home.com': 'nonat',
	'nooknook.jp': 'nook',
	'nudge.cards': 'Nudge',
	'oikosmusic.tokyo': 'OIKOS MUSIC',
	'oiwaii.taian-inc.com': 'TAIAN',
	'olive799451.studio.site': 'Japan Career',
	'opsigo.com': 'Opsigo',
	'oyraa.com': 'Oyraa',
	'partner-prop.com': 'PartnerProp',
	'payn.io': 'Payn',
	'pergikuliner.com': 'PergiKuliner',
	'photoruction.com': 'Photoruction',
	'pictureinbottle.com': 'Picture in Bottle',
	'plantio.co.jp': 'Plantio',
	'plutos.one': 'plutos ONE',
	'pres.world': 'PRES',
	'progummy.com': 'Progummy',
	'psygig.com': 'PSYGIG',
	'qoala.id': 'Qoala',
	'recompound.id': 'Recompound',
	'rekma.fan': 'Haul',
	'remitaid.io': 'RemitAid',
	'replayce.co.jp': 'RePlayce',
	'resortworx.jp': 'Resort Worx',
	'rey.id': 'Rey',
	'rootopia.vn': 'Rootopia',
	'route06.co.jp': 'ROUTE06',
	'runchise.com': 'Runchise',
	'selly.vn': 'Selly',
	'service.biztex.co.jp': 'BizteX',
	'service.recerqa.com': 'Recerqa',
	'shuttlepay.jp': 'Shuttle Pay',
	'sinbad.co.id': 'Sinbad',
	'skillnote.jp': 'Skillnote',
	'skygate-tech.com': 'Skygate Technologies',
	'smartcraft.jp': 'Smart Craft',
	'smartesg.jp': 'SmartESG',
	'spun.global': 'SPUN Global',
	'stepchange.earth': 'StepChange',
	'storyhub.jp': 'StoryHub',
	'suke-dachi.jp': 'Sukedachi',
	'super-denwa.com': 'KAITAK',
	'synamon.jp': 'Synamon',
	'syskul.com': 'Syskul',
	'takumi-force.jp': 'Takumi Force',
	'technology-doctor.com': 'TechDoctor',
	'tensorenergy.jp': 'Tensor Energy',
	'ternakin.co': 'Ternakin',
	'thephage.life': 'The Phage',
	'three-tiger.com': 'Three Tiger',
	'thuocsi.vn': 'Buymed',
	'tierrasinc.com': 'TIERRAS',
	'timee.co.jp': 'Timee',
	'todoker.com': 'Todoker',
	'tokyomixcurry.com': 'Tokyo Mix Curry',
	'unlimitech.co.jp': 'UnlimiTech',
	'vcacoffee.com': 'VCA Coffee',
	'velpha.ai': 'Velpha',
	'vietcetera.com': 'Vietcetera',
	'vouchconcierge.com': 'Vouch',
	'wareflex.io': 'Wareflex',
	'wellday.jp': 'wellday',
	'yachinhoshocloud.jp': 'rease',
	'zenport.io': 'ZENPORT',
	'zerobillbank.com': 'ZEROBILLBANK'
};

// the startups with no site, by the file of their logo
const LOGOS: Record<string, string> = {
	'106643776_224606578498433_7302933922635350182_n': 'Nupp1',
	'307239c341ea4ce40890b4e3884be35ca4767345-2': 'Subdream Studios',
	'49599574_1214603558697357_8376526235521515520_n': 'StayList',
	'a6eb03d10ccd3527926d33ae7e589f0f-e1567336056445': 'Shukatsu Net',
	bluetribe: 'Blue Tribe',
	'crezit_logo-1': 'Crezit',
	dreamstock: 'Dreamstock',
	'fowd-1': 'FOWD',
	handpickd: 'Handpickd',
	'logo-sofi-with-tagline-e1567335709403': 'Sofi',
	logo_kankak_1024: 'Kankak',
	'mobilkamu-e1567335999987': 'Mobilkamu',
	nectico: 'Nectico',
	'spectra-2': 'Spectra'
};

const SECTION = /(?=<section\b[^>]*\bclass="portfolio\b)/;
const STARTUPS = /^<section\b[^>]*\bclass="portfolio -startups"/;
const ITEM = /(?=<li class="portfolio__item")/;
const SITE = /class="portfolioDetail__url">\s*<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const LOGO = /<img\b[^>]*\bsrc="([^"]+)"/;
const META = /class="portfolioDetail__metaName">([\s\S]*?)<\/span>/g;
const FUND = /^GV-\d+$/i;
const PLACES: Record<string, string> = { sea: 'Southeast Asia' };
// a file named for nothing: a hash, a photo's number
const UNINFORMATIVE = /^([0-9a-f]{16,}|[0-9_]+n?)$/i;

const DECORATION = ['goto', 'get', 'try', 'use', 'join', 'with', 'go', 'my'];
const SUBDOMAIN = /^(www|en|de|fr|es|it|pt|nl|uk|us|app|corp|company|service|lp|biz|jp|foods)$/i;
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

const titled = (s: string) =>
	s
		.split(/[\s_-]+/)
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
	return titled(label);
}

// "logo_kankak_1024.png" -> "logo_kankak_1024"
const fileKey = (src: string) =>
	decodeURIComponent(src.split('?')[0].split('/').pop() ?? '')
		.replace(/\.\w+$/, '')
		.toLowerCase();

// what a logo's file says of the company, when it says anything
function fileName(key: string): string {
	const name = key
		.replace(/-e\d{6,}$/, '')
		.replace(/[-_](\d+|logo|with|tagline|vertical|color|colour)\b/g, '')
		.replace(/^logo[-_]/, '');
	return !name || UNINFORMATIVE.test(name) ? '' : titled(name);
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const startups = html.split(SECTION).find((section) => STARTUPS.test(section));
	if (!startups) {
		throw new Error('genesia: the companies page has no startups section — the layout moved');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of startups.split(ITEM).slice(1)) {
		const url = unescape(item.match(SITE)?.[1] ?? '');
		const host = hostOf(url);
		const logo = fileKey(item.match(LOGO)?.[1] ?? '');
		const name = host ? (NAMES[host] ?? domainName(host)) : (LOGOS[logo] ?? fileName(logo));
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const meta = [...item.matchAll(META)].map((m) => clean(m[1])).filter(Boolean);
		companies.push({
			name,
			category: [
				...meta.filter((m) => !FUND.test(m)).map((m) => PLACES[m.toLowerCase()] ?? m),
				...meta.filter((m) => FUND.test(m))
			]
				.filter((t, i, all) => all.indexOf(t) === i)
				.join(', '),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('genesia: no startups on the companies page');
	}

	return companies;
}
