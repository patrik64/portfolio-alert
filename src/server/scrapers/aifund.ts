import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://ai-fund.vc/our-portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with elementor: the portfolio page is a run of panels, each a
// picture, the company's logo, a line saying what it does and a paragraph
// about it, and below them, under "Our history of former investments of
// our partners", a carousel of logos, the companies the partners backed
// before the fund, kept with "Partners' Former Investment" as a tag. no
// panel or logo links anywhere, the logos' alt text is their files' names
// ("image 402") or nothing, and the company is named only in the logo, so
// the names are kept here by the logos' files, as the logos read. a panel
// whose logo is not listed here takes the name its paragraph opens with
// ("Qdrant is…"), and a carousel logo not listed here is left out until it
// is added; two of the carousel's marks name nothing legible and are left
// out. nothing marks an exit.
const PANELS: Record<string, string> = {
	'912ai': '913.ai',
	'Group-482577': 'Hirundo',
	'Percept-logo': 'IPercept',
	'dealcode-logo': 'Dealcode',
	'image-426': 'NoscAi',
	'mindpeak-logo': 'Mindpeak',
	'neuland-logo': 'neuland.ai',
	'qdrat-logo': 'Qdrant',
	'sinpex-logo': 'Sinpex',
	'vitas-logo': 'VITAS'
};

// the carousel of the partners' former investments
const FORMER: Record<string, string> = {
	'all4labels-logo-1': 'All4Labels',
	'image-402': 'Axel Springer Digital',
	'image-403': 'Delivery Hero',
	'image-404': 'ASGARD',
	'image-405': 'Enapter',
	'image-407': 'fulfin',
	'image-408': 'GCN',
	'image-409': 'i2x',
	'image-410': 'idealo',
	'image-411': 'immowelt',
	'image-412': 'Intershop',
	'image-413': 'Leverest',
	'image-415': 'Merantix',
	'image-416': 'N26',
	'image-418': 'SeLoger',
	'image-419': 'Smaato',
	'image-420': 'StepStone',
	'image-421': 'runtastic',
	'renk-logo': 'RENK'
};

const PANEL = /(?=<div\b[^>]*\bclass="[^"]*\bportfolio-item\b)/;
const IMAGE = /<img\b[^>]*\bsrc="([^"]*)"/g;
const PARAGRAPH = /<p\b[^>]*>([\s\S]*?)<\/p>/;
// "Qdrant is…", "Mindpeak's mission…", "913.ai revolutionizes…"
const OPENING =
	/^([A-Z0-9][\w.&-]*(?:\s+[A-Z][\w.&-]*)?)(?:[’']s)?\s+(?:is|are|offers|delivers|revolutionizes|revolutionises|enables|provides|builds|develops|helps|uses|makes|creates|was|mission)\b/;
const FORMER_HEADING = /<h2\b[^>]*>(?:(?!<\/h2>)[\s\S])*former investments(?:(?!<\/h2>)[\s\S])*<\/h2>/i;
const SLIDE = /<img\b[^>]*\bclass="swiper-slide-image"[^>]*>/g;
const SRC = /\bsrc="([^"]*)"/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// "…/uploads/2026/04/qdrat-logo.png" -> "qdrat-logo"
const fileOf = (src: string) => {
	const last = unescape(src).split(/[?#]/)[0].split('/').pop() ?? '';
	try {
		return decodeURIComponent(last).replace(/\.\w+$/, '');
	} catch {
		return last.replace(/\.\w+$/, '');
	}
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const formerAt = html.search(FORMER_HEADING);
	const portfolio = formerAt < 0 ? html : html.slice(0, formerAt);
	const former = formerAt < 0 ? '' : html.slice(formerAt);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	const add = (name: string, category: string) => {
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) return;
		seen.add(name.toLowerCase());
		companies.push({ name, category, url: PAGE_URL });
	};

	for (const panel of portfolio.split(PANEL).slice(1)) {
		// the first picture is the panel's, the second the company's logo
		const files = [...panel.matchAll(IMAGE)].map(([, src]) => fileOf(src));
		const listed = files.slice(1).map((file) => PANELS[file]).find(Boolean);
		const opening = clean(panel.match(PARAGRAPH)?.[1] ?? '').match(OPENING)?.[1] ?? '';
		add(listed ?? opening, '');
	}
	for (const [slide] of former.matchAll(SLIDE)) {
		add(FORMER[fileOf(slide.match(SRC)?.[1] ?? '')] ?? '', "Partners' Former Investment");
	}
	if (companies.length === 0) {
		throw new Error('aifund: no companies on the portfolio page');
	}

	return companies;
}
