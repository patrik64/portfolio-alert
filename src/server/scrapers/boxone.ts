import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.boxone.xyz/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page is one collection list, a company a tile —
// its logo, a line about it shown on hover, an "(exit)" note hidden unless
// the fund is out of it, and, hidden too, the categories the filters above
// the list read ("Bioengineering", "AI & Data Analytics"), "Exits" among
// them. "All Categories" is the filter that shows everything, though ten
// companies are filed under it besides their own, so it is not kept.
//
// not a name is written and no tile links anywhere: the logos carry no alt
// text, and most of their files kept the names of an old upload
// ("uploads-ssl.webflow.com-45077735575071040.png"). so the names are kept
// here, keyed on the id webflow gives each logo image, as the logos read;
// a logo not listed here has nothing to name it and is left out until it
// is added.
const LOGOS: Record<string, string> = {
	'628fab5059580e1707644343': 'Abalone Bio',
	'66e9eb8888ae64dd9205304d': 'AgGene',
	'6488b23b49ef20ea28a03357': 'Alectify',
	'66e9e5ed177dce21c4d22ff6': 'Altiro Energy',
	'67a4fb686497847f337ac256': 'Angstrom Insights',
	'67ed4e174d52ddf54006bba2': 'Anthology',
	'648b3397508914a8a901a399': 'Arpeggio',
	'6488953af9d31844f21224cf': 'Aview',
	'6298dc4bb63f6d5b59fb719a': 'Axonis',
	'648893ce07de869267217101': 'BioLoomics',
	'69275b526742f424e4cf4b85': 'BlankBio',
	'628fab718c109ec9a94248ac': 'Botpress',
	'628fb426c0f64c43a548de8e': 'Careteam',
	'628fb42b5170ad3ce60321d8': 'coding.bio',
	'628fb4302efac2dbd7499f4c': 'Coinmiles',
	'628fb4350034c3c42b95017c': 'Colabra',
	'628fb43cb0f0961a24f5eb55': 'Covariance',
	'628fb4445170ad9019032377': 'Cytotronics',
	'69f38e118f42afb7baf5d60f': 'Deep Root Biolabs',
	'6488949e33b17e91963cf6c5': 'Dispersa',
	'628fb4498c109e814442a2ed': 'DrugBank',
	'648b5969921798d9e89ffb08': 'Dynomics',
	'628fb44f5772f9521e2bc056': 'Element AI',
	'67d3110ea336da5a701eebb6': 'Encellin',
	'68d899308825ccde2c315401': 'EndoFold',
	'628fb456f0e436108b2620b4': 'FabricNano',
	'628fb45db2c7fb7f34aa0126': 'Fathom',
	'628fb46474508959a45875e1': 'FightCamp',
	'628fb46828110f7b97aa2a53': 'Flexpa',
	'64889181bc3735aa849733d0': 'Future Fields',
	'628fb46d8e684eadeb81ff5c': 'Gen1E Lifesciences',
	'67a51a3d224f80a9107b5e46': 'Guiker',
	'69f37bab4ce0f13a8fff23ae': 'Heritable Agriculture',
	'628fb47a6a528732ed45bd45': 'HumanFirst.ai',
	'64e5204b610ef02e60d5271c': 'Immune Biosolutions',
	'628fb48b15d1e20697ac4c4a': 'Isabl',
	'628fb49c067bea2847cee07a': 'Juvena Therapeutics',
	'628fb4dc28110f6a13aa2e38': 'Kenota Health',
	'628fb4e2a2b219409ea85cf0': 'Koyfin',
	'628fb4f98e684e3059820783': 'Lufa Farms',
	'6357bc5bd6a4f00f4fc8a771': 'Magnestar',
	'66e9dfcf351e1f0bec4226e4': 'Manifold',
	'628fb500ae967c0fd631e36c': 'Modulari-T',
	'67a51884aa5d14bf00d5d110': 'Mycroft',
	'628fb53e7703281f467cb525': 'Neuraura',
	'628fb5491681524cebae2ddc': 'Nimble Science',
	'628fb54e28110ffc09aa3061': 'Nolk',
	'628fb552f3a10b2a873d9c13': 'Nomic',
	'68b5f3b7591d8bf136b788e8': 'Nutrumami',
	'628fb535e5a298f8c013bab3': 'Näak',
	'628fb55f0c2e9ee7344a3bf5': 'Ochre Bio',
	'628fb56659580e6670649bd0': 'Odd Burger',
	'66e9ea424204ddca87311ddd': 'Oli',
	'66e9e581dbaf7fe14eb3a290': 'Opalia',
	'628fb55894393693f3073742': 'ORA',
	'628fb571fdd79aadcbe9d2b4': 'Pathway',
	'648b5a52b25fed62c450d0c8': 'Paume',
	'6488b310b34dede92157b170': 'PemPem',
	'628fb576bef97e1694ea4c5b': 'Phycobloom',
	'628fb57c5b7ae89a852f0f3e': 'Qoherent',
	'6488b4286a9c1c44233e2978': 'Quantivly',
	'69f36c85c1fbe07a1ae6e2e3': 'Red Ace Bio',
	'66dafee2a319dc301263ad08': 'Reliant',
	'6488c2411864bf338c2ed2fb': 'Revalia Bio',
	'628fb581b0328bf5e62fbed0': 'Revelio Labs',
	'628fb586f54d39df75c295d9': 'SelfDecode',
	'628fb58b0034c3307b950f7e': 'Seqera Labs',
	'648a082f2afd36ecbc995313': 'Socivolta',
	'628fb59561aee8a16e9ec6f0': 'Sollum',
	'628fb5996b22b9ddbc930593': 'Soundskrit',
	'628fb59fabcea78cb6ed13ef': 'SparkCharge',
	'631a0873e21a048da955aba8': 'Spiderwort',
	'68277fa1ce119f878200493a': 'Stately Bio',
	'628fb5a528110f8d98aa32e7': 'Stocktwits',
	'69f37e4f998404c7b5b585c3': 'StreamingFast',
	'648782840befe57c4a866da4': 'SX Bet',
	'628fb5bed62cae3a1bc278d3': 'Symend',
	'628fb5cc6604627e2a80824f': 'Talus Bio',
	'628fb5c428110f24ccaa34b0': 'Tatum Bioscience',
	'67d31f07c2c008a20b57a3b5': 'Tracel AI',
	'628fb4f25772f91fba2bc8ef': 'TriplePlay',
	'69cd3e4affec1f8d2f77882c': 'Type6 Therapeutics',
	'628fb5f07f62797ddf57a651': 'Unravel Biosciences',
	'628fb5f8f0e43607aa2629a1': 'Valence',
	'66e9eb08fb8caa6f9f7c01c2': 'Vantager',
	'66e9e8927992438518e0ba65': 'Velocity Bio',
	'628fb60331ad0b1b0e2e8d51': 'Vivid Machines',
	'628fb608c2063415edf59b87': 'Volumetric',
	'628fb610067bea7961cee862': 'Wallit',
	'628fb6166b22b90fc7930773': 'Wayfinder Biosciences',
	'628fb61cabcea708b0ed1829': 'Wolf & Grizzly',
	'628fb621f3a10b0a413d9f63': 'Wondeur',
	'67a50527e78ff9d7e73a782b': 'Xatoms',
	'674a22cf809d125a00839814': 'Xias Bio',
	'68b627b6d6c5f6e0fcf65fab': 'Xterna'
};

const TILE = /(?=<div\b[^>]*\bclass="portfolio-homepage-item-wrapper\b)/;
// webflow's id for the logo image heads its file's name
const LOGO = /<img\b[^>]*\bsrc="[^"]*\/([0-9a-f]{24})_[^"]*"/;
const EXIT = /<p\b[^>]*\bclass="([^"]*)"[^>]*>\s*\(exit\)\s*<\/p>/;
const CATEGORY = /<div\b[^>]*\bclass="w-dyn-item"[^>]*>\s*<p\b[^>]*>([\s\S]*?)<\/p>/g;
// a tile's lists close together, four at once, where the tile ends
const TILE_END = '</div></div></div></div>';
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
	for (const chunk of html.split(TILE).slice(1)) {
		const tile = chunk.slice(0, chunk.indexOf(TILE_END) + 1 || undefined);
		const name = LOGOS[tile.match(LOGO)?.[1] ?? ''];
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const categories = [...tile.matchAll(CATEGORY)].map(([, label]) => tag(label));
		const note = tile.match(EXIT)?.[1];
		const exited =
			(note !== undefined && !/\bw-condition-invisible\b/.test(note)) || categories.some((c) => /^exits$/i.test(c));
		companies.push({
			name,
			category: [...categories.filter((c) => c && !/^(all categories|exits)$/i.test(c)), exited ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('boxone: no companies on the portfolio page');
	}

	return companies;
}
