import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.upslope.vc/investments';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: one gallery block of logos, each linking out to the company.
// the fund set no image titles, so the alt text is only ever the uploaded
// filename ("download-1.png", "hi-res-gridcraft-logo-TransparentBG.png", a
// hex blob) — junk as often as not. a filename is therefore trusted to name
// the company only when it echoes the hostname the fund linked; otherwise the
// hostname itself is the name.
//
// the site carries no sectors, no stages and no exit badges, so every company
// comes back with an empty category.
//
// a link may point at an acquirer rather than the company — Gridcraft's logo
// links to workday.com — and there the hostname names the wrong company
// outright. a filename that names something the hostname has nothing to do
// with is that case, and it is the filename that is right.

const SLIDE = '<div class="slide" data-type="image"';
const IMAGE = /data-image="[^"]*\/([^/"?]+)\.(?:png|jpe?g|svg|webp|gif)"/i;
const HREF = /href="\s*(https?:\/\/[^"\s]+)"/;

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// a logo file is written all-lowercase as often as not ("rachio", "cloud
// elements"), but a word that already carries capitals is the fund's own
// spelling ("PureWow") and stays untouched
const titleCase = (s: string) =>
	s
		.split(' ')
		.map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

const hostLabel = (url: string) => {
	const labels = new URL(url).hostname.replace(/^www\./, '').split('.');
	return labels.length > 2 ? labels[labels.length - 2] : labels[0];
};

// the company's name is the longest run of neighbouring filename words the
// domain label vouches for — "rgb-logo-vertical-alt_revolution-space_full"
// against revolutionspace.com yields "Revolution Space".
//
// vouching means covering most of the label, not merely landing inside it:
// "help" sits in airhelp.com and "jc" in almost anything, but the companies
// are AirHelp and JumpCloud. a run that accounts for under three fifths of
// the label is a coincidence, and the label itself names the company instead.
// the words a logo file is dressed in rather than named by
const DRESSING =
	/^(logos?|logomark|wordmark|lockup|horizontal|vertical|transparent|transparentbg|bg|rgb|hi|res|hires|final|updated?|original|standard|web|alt|circle|no|square|full|screenshot|download|image|img|untitled|copy|version|v\d+|\d+|[\da-f]{16,})$/i;

function nameFor(url: string, file: string): string {
	const raw = hostLabel(url);
	const label = key(raw);
	const words = decodeURIComponent(file.replace(/\+/g, ' '))
		.split(/[^A-Za-z0-9]+/)
		.filter(Boolean);
	for (let len = words.length; len > 0; len--) {
		for (let start = 0; start + len <= words.length; start++) {
			const run = words.slice(start, start + len);
			const k = key(run.join(''));
			if (k.length * 5 >= label.length * 3 && label.includes(k)) {
				return titleCase(run.join(' '));
			}
		}
	}

	// nothing in the filename answers to the hostname. if what is left once the
	// dressing comes off still reads as a name — letters only, and enough of
	// them that an upload id or an acronym cannot pass — and the hostname
	// shares not a letter of it, the link leads somewhere the company is not
	const bare = words.filter((w) => /^[A-Za-z]+$/.test(w) && !DRESSING.test(w));
	const undressed = key(bare.join(''));
	if (undressed.length >= 4 && !label.includes(undressed) && !undressed.includes(label)) {
		return titleCase(bare.join(' '));
	}
	return titleCase(raw);
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const slide of html.split(SLIDE).slice(1)) {
		const file = slide.match(IMAGE)?.[1];
		const url = slide.match(HREF)?.[1];
		// a logo the fund never linked names nobody we could confirm
		if (!file || !url) continue;
		const name = nameFor(url, file);
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({ name, category: '', url });
	}

	if (companies.length === 0) {
		throw new Error('upslope: no companies in the investments gallery');
	}

	return companies;
}
