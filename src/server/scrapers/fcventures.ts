import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://fcventures.com/partnerships/';
// the host's firewall answers 403 to a chrome user-agent string, as stray
// dog's and helios capital's do, so the fetch says plainly who is asking
const UA = 'portfolio-alert/1.0 (+https://portfolio-alert.vercel.app)';
// it also puts its captcha in front of an address it distrusts, under a 2xx
// status, vercel's among them some nights; the page is asked for again
// after a wait, and the error says what the firewall answered
const RETRY_DELAY_MS = 10_000;

// wordpress, a theme of its own: every company is a card on the one page,
// with its name on the "Learn more" link and in the heading of the panel that
// opens, which links the company's site ("Visit the website"). the page's
// filters read the cards' classes, "Active Investments" and "Past
// Partnerships"; a past one keeps those words, as it may have been sold or
// have folded. a name can carry a note — "Regroup (formerly known as Array)",
// "Mindoula (merged with: 180 Health Partners)" — which is not part of it;
// a merger is kept as the note it is.

const CARD = /(?=<div\b[^>]*class="[^"]*\bpartner-grid-item\b(?!-))/;
const CLASSES = /^<div\b[^>]*class="([^"]*)"/;
const NAME = /\bdata-partner="([^"]*)"/;
const HEADING = /class="partner-content-full"[^>]*>\s*<h3\b[^>]*>([\s\S]*?)<\/h3>/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*>\s*Visit the website\s*<\/a>/i;
const NOTE = /\s*\(([^)]*)\)\s*$/;
const FORMERLY = /^(formerly|fka|f\.k\.a\.)\b/i;
const MERGED = /^merged\b/i;
const STEALTH = /^stealth\b/i;

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

// the partnerships page, or an error saying what answered instead
async function partnershipsPage(): Promise<string> {
	let answer = '';
	for (let attempt = 0; attempt < 2; attempt++) {
		if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
		const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
		const html = await resp.text();
		const captcha = /sgcaptcha/i.test(html);
		if (resp.ok && !captcha) return html;
		answer = `${resp.status}` + (captcha ? ", siteground's captcha" : '');
	}
	throw new Error(`fcventures: ${PAGE_URL} answered ${answer}`);
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await partnershipsPage();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const listed = clean(card.match(NAME)?.[1] || card.match(HEADING)?.[1] || '');
		const note = listed.match(NOTE)?.[1]?.trim() ?? '';
		const aside = FORMERLY.test(note) || MERGED.test(note);
		const name = aside ? listed.replace(NOTE, '').trim() : listed;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const classes = card.match(CLASSES)?.[1] ?? '';
		companies.push({
			name,
			category: [
				MERGED.test(note) ? tag(note.replace(/:\s*/, ' ')).replace(/^merged/i, 'Merged') : '',
				/\bpartner-past\b/.test(classes) ? 'Past partnership' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: unescape(card.match(SITE)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('fcventures: no partner cards on the partnerships page');
	}

	return companies;
}
