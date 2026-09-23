import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.fuel.ventures';
const PAGE_URL = `${BASE_URL}/portfolio`;
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// brizy cloud: the portfolio is two tabs of posts, "Seed (EIS)" and
// "Pre-Seed (SEIS)", thirty-six to a page, both paged by the one "?page="
// parameter, so the pages are walked until one adds no one. a post is a
// logo, with no alt text, over a line about the company, the whole card
// linking its site; a company can sit in both tabs, and takes both labels.
// no name is written anywhere but in the logos, so a company is known by the
// address it links to, under the name it gives itself, looked up once; one
// missing from the list is named after its address until it is added. a
// company sold links the fund's own news of the sale instead of a site, and
// is named from its logo's file and counted as exited.
const NAMES: Record<string, string> = {
	'51tocarbonzero.com': '51toCarbonZero',
	'abingdon.software': 'Abingdon',
	'abuelaone.com': 'Abuela One',
	'adzact.com': 'Adzact',
	'affinitylabs.ai': 'Affinity Labs',
	'aide.health': 'Aide Health',
	'aiscore.ai': 'AI Score',
	'allasso.ch': 'Allasso',
	'allocation-strategy.com': 'Allocation Strategy',
	'aloma.io': 'Aloma',
	'ambr.ai': 'Ambr AI',
	'arbolus.com': 'Arbolus',
	'arcube.com': 'Arcube',
	'arrival.ac': 'Arrival',
	'artic.works': 'Artic',
	'askvinny.com': 'Vinny',
	'atria-ai.com': 'Atria AI',
	'audittoolbar.com': 'Audit Toolbar',
	'augmetec.com': 'Augmetec',
	'aviel.tech': 'Aviel',
	'banqora.com': 'Banqora',
	'bastion-ai.com': 'Bastion',
	'beyonk.com': 'Beyonk',
	'blocktype.co.uk': 'Blocktype',
	'boulevardonline.co.uk': 'Boulevard',
	'brizy.io': 'Brizy',
	'bsktpay.co': 'bsktpay',
	'buildscan.co': 'Buildscan',
	'business.stairpay.com': 'Stairpay',
	'carta.com': 'Capdesk',
	'cghero.com': 'CGHero',
	'chaserhq.com': 'Chaser',
	'cheerscontracts.com': 'Cheers',
	'claimit.ai': 'Claimit',
	'communitywolf.com': 'Community Wolf',
	'compound22.com': 'Compound22',
	'compoundapp.co.uk': 'Compound',
	'contentcal.io': 'ContentCal',
	'contentradar.ai': 'ContentRadar',
	'correcto.es': 'Correcto',
	'creoate.com': 'Creoate',
	'cultmia.com': 'Cult Mia',
	'curvo.ai': 'Curvo',
	'cyb3roperations.com': 'Cyb3r Operations',
	'damisa.xyz': 'Damisa',
	'datasapien.com': 'DataSapien',
	'deaku.app': 'Deaku',
	'deeligence.com': 'Deeligence',
	'dosen.io': 'Dosen',
	'egregious.ai': 'Egregious AI',
	'eilla.ai': 'Eilla AI',
	'ekko.earth': 'ekko',
	'eleos.co.uk': 'Eleos',
	'enginuityai.io': 'Enginuity',
	'eventwise.com': 'Eventwise',
	'everybodycounts.org.uk': 'Everybody Counts',
	'expocart.com': 'ExpoCart',
	'finalrentals.com': 'Final Rentals',
	'flatpeak.com': 'Flatpeak',
	'flowla.com': 'Flowla',
	'floxmind.com': 'FloxMind',
	'forensicalpha.com': 'Forensic Alpha',
	'frupro.com': 'FruPro',
	'fundpath.com': 'Fundpath',
	'geomiq.com': 'Geomiq',
	'getbarbr.com': 'Barbr',
	'getdistillery.com': 'Distillery',
	'getfamnest.com': 'Famnest',
	'getgreenspark.com': 'Greenspark',
	'getincredible.com': 'Incredible',
	'glyde.money': 'Glyde',
	'gotmoves.co.uk': 'GotMoves',
	'greatlab.io': 'GreatLab',
	'heypesto.ai': 'Pesto',
	'hiiker.app': 'Hiiker',
	'holidayfox.com': 'HolidayFox',
	'homemove.com': 'Homemove',
	'hotelmanager.co': 'HotelManager',
	'hownow.com': 'HowNow',
	'hub.patchs.ai': 'Patchs',
	'icustoms.ai': 'iCustoms',
	'ili-ad.com': 'iliAD',
	'inframindlabs.com': 'InfraMind',
	'infranomics.ai': 'Infranomics',
	'instep.ai': 'Instep',
	'intelligentcore.io': 'Intelligent Core',
	'intriq.ai': 'Intriq AI',
	'jackfertility.co.uk': 'Jack Fertility',
	'joinjuniver.com': 'Juniver',
	'joinslinger.com': 'Slinger',
	'joinsouk.com': 'Souk',
	'journeetrips.com': 'Journee',
	'jove.co': 'Jove',
	'karavel.ai': 'Karavel',
	'keldyn.ai': 'Keldyn',
	'levellr.com': 'Levellr',
	'lifted-talent.com': 'Lifted',
	'listabl.com': 'Listabl',
	'locai.co.uk': 'Locai',
	'lumi.network': 'Lumi',
	'lumoenergy.co.uk': 'Lumo',
	'lunio.ai': 'Lunio',
	'marlo.online': 'Marlo',
	'martello.app': 'Martello',
	'materialsmarket.com': 'Materials Market',
	'mistiai.com': 'Misti AI',
	'moteefe.io': 'Moteefe',
	'moverly.com': 'Moverly',
	'myserene.io': 'Serene',
	'mytender.io': 'MyTender',
	'naytal.uk': 'Naytal',
	'nu-credits.com': 'Nu-Credits',
	'numonic.ai': 'Numonic',
	'odore.com': 'Odore',
	'onbuy.com': 'OnBuy',
	'oqu.ai': 'OQU',
	'otio.ai': 'Otio',
	'out.fund': 'Outfund',
	'outmin.io': 'Outmin',
	'p3mo.io': 'P3MO',
	'palqee.com': 'Palqee',
	'pantaindex.com': 'PANTA',
	'paycontrol.xyz': 'PayControl',
	'planning-hub.com': 'PlanningHub',
	'playe.pro': 'PLAYE',
	'primis.cx': 'Primis',
	'prod.norvana.ai': 'Norvana',
	'productivemachines.co.uk': 'Productive Machines',
	'prosper.co.uk': 'Prosper',
	'reallinks.io': 'Real Links',
	'rehuman.co.uk': 'Rehuman',
	'responseiq.com': 'ResponseiQ',
	'rgrid.tech': 'Research Grid',
	'riskblocs.com': 'RiskBlocs',
	'robominder.ai': 'Robominder',
	'roomix.com': 'Roomix',
	'runa.io': 'Runa',
	'safework.place': 'Safe Workplace',
	'sagittal.ai': 'Sagittal',
	'saleslynk.co.uk': 'SalesLynk',
	'satorusgroup.com': 'Satorus',
	'scopebetter.com': 'Scope',
	'scribelabs.ai': 'Scribe',
	'searchland.co.uk': 'Searchland',
	'sencillo.finance': 'Sencillo',
	'shiftplatform.co.uk': 'Shift',
	'shophomestyles.com': 'ShopHomeStyles',
	'soker-data.com': 'SökerData',
	'sparklayer.io': 'SparkLayer',
	'spendkey.io': 'Spendkey',
	'stoa.money': 'Stoa',
	'studiospace.com': 'StudioSpace',
	'supportwave.com': 'Supportwave',
	'synthax.ai': 'Synthax',
	'tessaract.io': 'Tessaract',
	'theodosian.com': 'Theodosian',
	'thetrusted.io': 'Trusted',
	'tradeaire.ai': 'TradeAIre',
	'tyten.ai': 'TYTEN AI',
	'usehammock.com': 'Hammock',
	'usetwirl.com': 'Twirl',
	'vabble.io': 'Vabble',
	'valinorintelligence.com': 'Valinor Intelligence',
	'vanellus.tech': 'Vanellus',
	'velocity.xyz': 'Velocity',
	'volt.io': 'Volt',
	'vouchsafe.id': 'Vouchsafe',
	'vrfyinc.com': 'VRFY',
	'wealthai.tech': 'WealthAi',
	'wearechosen.io': 'Chosen',
	'wearefeel.com': 'Feel',
	'wearegroov.io': 'Groov',
	'welovealfa.com': 'Alfa',
	'withjuno.com': 'Juno',
	'wollit.com': 'Wollit',
	'wovenadvice.com': 'Woven Advice',
	'yavr.io': 'Yavrio'
};

const TAB = /<li class="brz-tabs__nav--item brz-tabs__nav--desktop[^"]*">[\s\S]*?<span\b[^>]*>([\s\S]*?)<\/span>/g;
const WIDGET = /(?=<div class="brz-posts\b)/;
const POST = /(?=<div class="brz-posts__item")/;
const LINK = /<a\b[^>]*class="brz-a brz-container-link"[^>]*href="(https?:\/\/[^"]+)"/;
const LOGO = /<img class="brz-img"[^>]*\bsrc="([^"]+)"/;
const OWN_SITE = /^(www\.)?fuel\.ventures$/i;
const SOLD = /acqui|exit|sold/i;
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

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
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

// "Medley-logo-white.png" -> "Medley"
function fileName(src: string): string {
	return decodeURIComponent(src.split('?')[0].split('/').pop() ?? '')
		.replace(/\.\w+$/, '')
		.replace(/[-_ ]*\b(logo|white|black|colou?r|horiz|horizontal|light|dark|web)\b/gi, ' ')
		.replace(/[-_]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies = new Map<string, ScrapedCompany & { labels: string[] }>();

	for (let page = 1; page <= MAX_PAGES; page++) {
		const url = page === 1 ? PAGE_URL : `${PAGE_URL}?page=${page}`;
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html = await resp.text();
		const tabs = [...html.matchAll(TAB)].map((m) => tag(m[1]));

		let added = 0;
		html
			.split(WIDGET)
			.slice(1)
			.forEach((widget, i) => {
				const label = tabs[i] ?? '';
				// the pager closes the widget; what follows is the next tab's
				for (const post of widget.split('brz-posts__pagination')[0].split(POST).slice(1)) {
					const link = unescape(post.match(LINK)?.[1] ?? '');
					const host = hostOf(link);
					if (!host) continue;
					const own = OWN_SITE.test(host);
					const name = own ? fileName(post.match(LOGO)?.[1] ?? '') : (NAMES[host] ?? domainName(host));
					if (!name || STEALTH.test(name)) continue;
					const key = name.toLowerCase();
					const known = companies.get(key);
					if (known) {
						if (label && !known.labels.includes(label)) known.labels.push(label);
						continue;
					}
					added++;
					companies.set(key, {
						name,
						category: own && SOLD.test(link) ? 'Exited' : '',
						url: link,
						labels: label ? [label] : []
					});
				}
			});
		if (added === 0) break;
	}

	if (companies.size === 0) {
		throw new Error('fuelventures: no companies in the portfolio tabs');
	}

	return [...companies.values()].map(({ labels, category, ...company }) => ({
		...company,
		category: [...labels, category].filter(Boolean).join(', ')
	}));
}
