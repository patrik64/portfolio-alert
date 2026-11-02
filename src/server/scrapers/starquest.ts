import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.starquest-capital.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress and elementor: four tabs, "All" and one per theme, each a grid of logos
// that open a popup, the popups all in the page, the id of the one a logo opens
// written into its link. a popup has a line and a paragraph about the company, its
// linkedin and its site, and "[EXITED]" on the ones it is. the theme is known by the
// tab a logo sits under. the name is written nowhere as such, the logos having no alt
// text and the paragraphs opening any which way, so the companies are named from a
// list looked up once, keyed by the address; one missing from it is named after its
// address until it is added.
const NAMES: Record<string, string> = {
	'aldoria.com': 'Aldoria',
	'atawey.com': 'Atawey',
	'auum.com': 'Auum',
	'beeldi.com': 'Beeldi',
	'cailabs.com': 'Cailabs',
	'dnagensee.com': 'DNAgensee',
	'ecoat.fr': 'Ecoat',
	'effy.fr': 'Effy',
	'heliup-solar.com': 'Heliup',
	'hellowatt.fr': 'Hello Watt',
	'herakl.io': 'Heraklio',
	'hydroclimat.com': 'Hydroclimat',
	'itk.fr': 'ITK',
	'kyotherm.com': 'Kyotherm',
	'leakmited.com': 'Leakmited',
	'lesnouvellesfermes.com': 'Les Nouvelles Fermes',
	'olikrom.com': 'Olikrom',
	'sos-accessoire.com': 'SOS Accessoires',
	'tryon-environnement.com': 'Tryon',
	'ubees.com': 'Ubees',
	'waga-energy.com': 'Waga Energy',
	'wearephenix.com': 'Phenix',
	'zelup.com': 'Zelup'
};

const TAB_TITLE = /class="ue-item-title">([^<]*)/g;
const TAB_GRID = /class="uc_image_carousel_container_holder ue-item"/;
const POPUP = /(?=<div data-elementor-type="popup")/;
const POPUP_ID = /\bdata-elementor-id="(\d+)"/;
const OPENS_POPUP =
	/<figure class="elementor-image-box-img">\s*<a\b[^>]*\bhref="#elementor-action%3Aaction%3Dpopup%3Aopen%26settings%3D([A-Za-z0-9%]+)"/g;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/g;
const NOT_THE_COMPANY = /\/\/(?:[\w-]+\.)*(?:starquest-capital|linkedin|twitter|x|facebook|instagram|youtube)\.com\b/i;
const EXITED = /\[EXITED\]/;

// the id out of a link's settings, base64 of {"id":"10033","toggle":false}
const idIn = (settings: string): string => {
	try {
		return String(JSON.parse(Buffer.from(decodeURIComponent(settings), 'base64').toString()).id ?? '');
	} catch {
		return '';
	}
};

// "protecting resources" -> "Protecting Resources"
const titled = (s: string) => s.trim().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

// "hello-bio.com" -> "Hello Bio"
const nameFrom = (host: string) => titled(host.split('.')[0].replace(/-/g, ' '));

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const [beforePopups, ...popups] = html.split(POPUP);
	const tabs = [...beforePopups.matchAll(TAB_TITLE)].map(([, title]) => titled(title));
	const [all = '', ...themes] = beforePopups.split(TAB_GRID).slice(1);
	const idsIn = (grid: string) => [...grid.matchAll(OPENS_POPUP)].map(([, settings]) => idIn(settings));

	const themeOf = new Map<string, string>();
	// the first tab is "All", whose grid gives the list itself
	themes.forEach((grid, i) => {
		for (const id of idsIn(grid)) if (tabs[i + 1]) themeOf.set(id, tabs[i + 1]);
	});
	const popupOf = new Map(popups.map((popup) => [popup.match(POPUP_ID)?.[1] ?? '', popup]));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const id of idsIn(all)) {
		const popup = popupOf.get(id) ?? '';
		const url = [...popup.matchAll(LINK)].map(([, href]) => href).find((href) => !NOT_THE_COMPANY.test(href)) ?? '';
		if (!url) continue;
		const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
		const name = NAMES[host] ?? nameFrom(host);
		if (seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: [themeOf.get(id) ?? '', EXITED.test(popup) ? 'Exited' : ''].filter(Boolean).join(', '),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('starquest: no companies on the portfolio page');
	}

	return companies;
}
