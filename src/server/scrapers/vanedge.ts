import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.vanedgecapital.com/companies/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// server-rendered wordpress (custom theme, no company post type in the REST
// API): the page is a logo grid, one .companies-grid__item per company, whose
// sector slugs sit in the item's class list ("hard-tech", plus "exits" for a
// realised investment) and whose "Read more" anchor points at a hidden
// #detailed-info-N panel further down carrying the blurb and, usually, the
// company's own site.
//
// nowhere does the markup state the company name — every logo is alt="Company
// logo". two site-owned sources are combined instead:
//   1. the blurb often opens with the name ("Autozen is a managed automotive
//      marketplace", "goTenna builds…"), which gives the real spelling; it is
//      only trusted when it echoes the company's own hostname or one of its
//      logo filenames, which rules out blurbs that open with a description
//      ("Provides virtualization products…").
//   2. otherwise the logo filename, cleaned of the badge/version noise the
//      theme piles on ("NewBitfusion", "canalyst-acquired", "SpaceXLogo2").
//      the plain logo in .company__status is preferred over the one in the
//      .company__logo link, which for exits is a combined "acquired" badge;
//      screenshot-style filenames ("Zrzut-ekranu-2019-…") are skipped.
// a few legacy exits end up with the fund's own shorthand ("PrivacyIMS",
// "ReconIntel") — imperfect, but the fund's own wording rather than a guess.

// noise the theme appends to logo filenames, stripped repeatedly per token
const SUFFIX = /(logos?v?\d*|acquired|acq|ipo|cropped|crop|scaled|original|final|wide)$/i;
const NOISE = /^(new|owler|logos?)$/i;
// filenames that are camera/screenshot dumps rather than a brand
const JUNK = /^(zrzut|screen|img|image|unnamed|photo|dsc|logo)/i;

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#8217;|&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const fileBase = (url: string) =>
	decodeURIComponent(url.split('/').pop() ?? '').replace(/\.\w+$/, '');

function nameFromLogo(url: string): string {
	const base = fileBase(url);
	if (!base || JUNK.test(base)) return '';
	const words: string[] = [];
	for (let token of base.split(/[_\-\s]+/)) {
		if (/^\d+(x\d+)?$/.test(token)) continue;
		for (let pass = 0; pass < 3; pass++) {
			const stripped = token
				.replace(/\d+$/, '')
				.replace(SUFFIX, '')
				.replace(/^New(?=[A-Z])/, '');
			if (stripped === token) break;
			token = stripped;
		}
		if (token.length < 2 || NOISE.test(token)) continue;
		// leave deliberate lower-case brandings alone ("xCures", "femtoai")
		words.push(/[A-Z]/.test(token) ? token : token.charAt(0).toUpperCase() + token.slice(1));
	}
	const name = words.join(' ');
	return name.length > 1 ? name : '';
}

// the leading capitalised run of the blurb, e.g. "North Vector Dynamics is
// building…" -> "North Vector Dynamics". the first word is taken whatever its
// case so lower-case brandings survive ("xAI", "goTenna", "#paid")
function nameFromBlurb(blurb: string): string {
	const words = blurb.split(' ').filter(Boolean);
	if (words.length === 0) return '';
	const taken = [words[0]];
	for (const word of words.slice(1, 5)) {
		if (/^[a-z]/.test(word)) break;
		taken.push(word);
	}
	return taken
		.join(' ')
		.replace(/[,.;:]+$/, '')
		.replace(/['’]s$/, '');
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const labels = new Map<string, string>();
	for (const [, slug, label] of html.matchAll(
		/data-filter="type" data-value="([^"]+)"[^>]*>([^<]*)<\/a>/g
	)) {
		labels.set(slug, decode(label));
	}

	const panels = new Map<string, string>();
	for (const panel of html.split('<div id="detailed-info-').slice(1)) {
		panels.set(panel.slice(0, panel.indexOf('"')), panel);
	}

	const companies: ScrapedCompany[] = [];
	for (const [, classes, item, id] of html.matchAll(
		/<div class="companies-grid__item ([^"]*)">([\s\S]*?)detailed-info-(\d+)" class="link-more/g
	)) {
		const panel = panels.get(id) ?? '';
		const url = panel.match(/detailed-info__link">\s*<a href="([^"]*)"/)?.[1] ?? '';
		const logos = [...item.matchAll(/<img src="([^"]*)"/g)].map((m) => m[1]);
		const [linkLogo = '', statusLogo = ''] = logos;
		const blurb = decode((item.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? '').replace(/<[^>]+>/g, ' '));

		const host = url ? new URL(url).hostname.replace(/^www\./, '') : '';
		const known = [key(host), key(fileBase(statusLogo)), key(fileBase(linkLogo))];
		const fromBlurb = nameFromBlurb(blurb);
		let name = '';
		if (fromBlurb && key(fromBlurb) && known.some((k) => k && k.includes(key(fromBlurb)))) {
			name = fromBlurb;
		}
		if (!name) name = nameFromLogo(statusLogo) || nameFromLogo(linkLogo);
		if (!name && host) {
			const label = host.split('.')[0];
			name = label.charAt(0).toUpperCase() + label.slice(1);
		}
		if (!name) continue;

		const location = decode(item.match(/company__location[\s\S]*?<span>([^<]*)<\/span>/)?.[1] ?? '');
		const tags = classes
			.split(/\s+/)
			.filter((c) => labels.has(c))
			.map((c) => (c === 'exits' ? 'Exited' : labels.get(c)!))
			.sort((a, b) => Number(a === 'Exited') - Number(b === 'Exited'));
		companies.push({
			name,
			category: [location, ...tags].filter(Boolean).join(', '),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('vanedge: no companies on the page');
	}

	return companies;
}
