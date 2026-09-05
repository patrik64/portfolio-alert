import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://up.partners/companies/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with its rest api switched off. the grid shows logos and nothing
// else, but every card's popup is rendered into the page too, and a popup
// carries the logo, a sentence about the company and the link to its site.
//
// nothing on the page states a company's name. two things suggest it — the
// sentence, which usually opens with it ("Westmag is building drone motors"),
// and the logo's filename — and either can be wrong: sentences sometimes open
// with what the company does, and a filename is sometimes a leftover from
// another company (eli.build's logo file is named after Reliable Robotics).
// so a suggestion counts only when the company's own hostname bears it out,
// and the filename is the last word only when nothing else fits.

const POPUP = /<div class="popup" data-id="\d+"([\s\S]*?)(?=<div class="popup" data-id="|$)/g;
const LOGO = /popup__cont__logo"[\s\S]{0,300}?src="[^"]*\/([^/"?]+)\.(?:png|jpe?g|svg|webp)"/i;
const SITE = /popup__cont__button button" href="(https?:\/\/[^"]+)"/;
const TEXT = /popup__cont__text">([^<]*)</;

// the words a logo file is dressed in rather than named by
const DRESSING =
	/^(logos?|logomark|wordmar?k|wordmrk|mrk|lockup|artboard|transparent|bg|rgb|w|sm\d*|lg|md|small|large|white|black|charcoal|allwhite|all|no|updated?|untitled|design|final|png|img|imgi|e\d+|v?\d+|\d+x\d+)$/i;

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const titleCase = (s: string) =>
	s
		.split(' ')
		.map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

// the label that names the company: the one before the public suffix, which is
// two labels long for the likes of kolors.com.mx
const hostLabel = (url: string) => {
	const labels = new URL(url).hostname.replace(/^www\./, '').split('.');
	if (labels.length < 3) return labels[0];
	const suffixed =
		/^(com|co|net|org|gov|edu|ac)$/i.test(labels[labels.length - 2]) &&
		labels[labels.length - 1].length === 2;
	return labels[labels.length - (suffixed ? 3 : 2)];
};

// a name and a hostname bear each other out when either contains the other —
// "Reliable Robotics" against reliable.co, "Veo" against veoride.com
const vouched = (name: string, host: string) => {
	const k = key(name);
	return k.length > 2 && (host.includes(k) || k.includes(host));
};

// the sentence opens with the company where it opens with a capital and keeps
// going in capitals — "Point One is the first…" gives "Point One", while
// "Building the first AI foundation model…" gives only "Building"
const fromSentence = (text: string) => {
	const words: string[] = [];
	for (const word of text.trim().split(/\s+/).slice(0, 4)) {
		if (!/^[A-Z0-9]/.test(word)) break;
		words.push(word.replace(/[.,:;!?]+$/, ''));
	}
	return words.join(' ');
};

const fromFile = (file: string) =>
	decodeURIComponent(file.replace(/\+/g, ' '))
		.split(/[^A-Za-z0-9]+/)
		.filter((w) => w && !DRESSING.test(w))
		.join(' ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, popup] of html.matchAll(POPUP)) {
		const url = popup.match(SITE)?.[1];
		if (!url) continue;
		const host = key(hostLabel(url));
		const sentence = fromSentence(popup.match(TEXT)?.[1] ?? '');
		const file = fromFile(popup.match(LOGO)?.[1] ?? '');

		const name =
			[sentence, file].find((candidate) => candidate && vouched(candidate, host)) ||
			file ||
			titleCase(hostLabel(url));
		const clean = titleCase(name.trim());
		if (!clean || seen.has(clean)) continue;
		seen.add(clean);

		companies.push({ name: clean, category: '', url });
	}

	if (companies.length === 0) {
		throw new Error('uppartners: no companies on the page');
	}

	return companies;
}
