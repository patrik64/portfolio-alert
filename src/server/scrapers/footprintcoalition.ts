import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.footprintcoalition.com';
const PAGE_URL = `${BASE_URL}/investments`;
// each sector is a page of its own showing the same logos
const SECTORS: [string, string][] = [
	['consumer', 'Consumer'],
	['data-and-analytics', 'Data & Analytics'],
	['energy', 'Energy'],
	['food-and-agriculture', 'Food & Agriculture'],
	['homes-and-buildings', 'Homes & Buildings'],
	['mobility', 'Mobility']
];
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wix: the investments page is a wall of logos, each over a line about the
// company, linking a page of the fund's own that gives no site either. the
// logos' alt text is their file's name, so a company is known by its logo
// file, under its name looked up once; one missing from the list is named
// after the file until it is added. the sectors are pages of their own
// showing the same logos, read for the labels.
const NAMES: Record<string, string> = {
	'albedo_logo_web_purple': 'Albedo',
	'62604e465f4d9ac05fc514e5_1arcadia_logo3-white-p-500': 'Arcadia',
	'aspiration-logo-cef1421ac61c4da09490df27a14815ce': 'Aspiration',
	'cfs-logo-white-400x134-1': 'Commonwealth Fusion Systems',
	'climate-ai-color-logo': 'ClimateAI',
	'cloudpaper-logo_v5-black_1_400x': 'Cloud Paper',
	'covetool_logo_share-640w': 'cove.tool',
	crusoe_color_20e9e934: 'Crusoe Energy',
	kindred: 'Kindred Motorworks',
	'lyten-logo-final-01': 'Lyten',
	motif: 'Motif FoodWorks',
	'22_br_logo_mff_wordmarklogo_outline_grn-01': 'MyForest Foods',
	'nobell-logo': 'Nobell',
	populus_secondarylogo_dark: 'Populus',
	prolificmachines: 'Prolific Machines',
	'rwdc-logo': 'RWDC',
	fyah0fsxpdpa98rpwghj: 'Sealed',
	'span-logo-1': 'Span',
	idv7hzfglj: 'Sound Ag',
	'turntide-technologies': 'Turntide',
	jdee2dtpq3c5zxdr3ense1zr5df1649273964421_200x200: 'Whisper Aero',
	wildtype_foods_logo: 'Wildtype',
	logo_header: 'Ÿnsect',
	'zero-acre': 'Zero Acre Farms'
};

// the fund's own logos, and wix's social icons
const OWN = /^(fpc|footprint|instagram|linkedin|twitter|facebook|youtube)|^[0-9a-f]{6}_[0-9a-f]{32}~mv2/i;
const IMAGE = /<img\b[^>]*\bsrc="([^"]+)"[^>]*>/g;

// "…/crusoe_color_20e9e934.png" -> "crusoe_color_20e9e934"
function logoKey(src: string): string {
	const file = decodeURIComponent(src.split('?')[0].split('/').pop() ?? '');
	return file.replace(/(\.(png|jpe?g|webp|svg|gif|avif))+$/i, '').replace(/_(png|jpe?g)$/i, '').toLowerCase();
}

function logos(html: string): string[] {
	return [...html.matchAll(IMAGE)].map((m) => logoKey(m[1])).filter((key) => key && !OWN.test(key));
}

const titled = (key: string) =>
	key
		.replace(/[-_]+/g, ' ')
		.replace(/\b(logo|web|color|final|\d+x\d+|\d+)\b/gi, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/\b\w/g, (c) => c.toUpperCase());

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [page, ...sectorPages] = await Promise.all([
		fetchText(PAGE_URL),
		// a sector page that will not load costs its label for the night
		...SECTORS.map(([path]) => fetchText(`${BASE_URL}/${path}`).catch(() => ''))
	]);
	const labels = new Map<string, string[]>();
	sectorPages.forEach((html, i) => {
		for (const key of logos(html)) labels.set(key, [...(labels.get(key) ?? []), SECTORS[i][1]]);
	});

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const key of logos(page)) {
		const name = NAMES[key] ?? titled(key);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: (labels.get(key) ?? []).join(', '), url: '' });
	}

	if (companies.length === 0) {
		throw new Error('footprintcoalition: no logos on the investments page');
	}

	return companies;
}
