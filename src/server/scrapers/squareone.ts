import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://squareone.vc/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress (once Paua Ventures): the portfolio is a grid of logos, the
// whole of it in the page, a card a company marked "active" or "exit",
// turning over to a line about it and a link to its site. the name is the
// logo's alt text where the logo has one; otherwise the line names the
// company — by the words that spell its site's name ("…, AVAYL empowers"),
// or, failing those, by the capitalised words it opens on ("Graph
// Therapeutics is…"). a card that names its company nowhere is left out,
// as are the blocks among the cards that carry no status, a quote and a
// funding note. an exit is kept with the Exited tag; the fund files nobody
// under a sector.

const CARD = /(?=<div class="company">)/;
const LOGO = /<div class="unhovered">\s*<img\b[^>]*\balt="([^"]*)"/;
const STATUS = /<div class="(active|exit)">/;
const LINE = /<p>([\s\S]*?)<\/p>/;
const SITE = /<a class="text-btn[^"]*" href="([^"]*)"/;
// a word as a name may be written: "C1", "Hero", "Edgeless"
const WORD = /[\p{L}\p{N}][\p{L}\p{N}.&'’+-]*/gu;
// words a line opens on that are no name
const OPENER = /^(?:by|the|a|an|with|our|we|this|in|for|from|as|at|on|founded|built)$/i;
const VERB =
	/^(?:is|are|was|has|have|offers?|provides?|develops?|designs?|created?|creates|sells?|accelerates?|empowers?|builds?|helps?|delivers?|enables?|operates?|connects?|combines?|makes?|brings?|uses?|turns?|lets?|allows?|powers?|improves?|transforms?|automates?)$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const spelled = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// the company's name as its card writes it — see above
function nameOf(alt: string, line: string, site: string): string {
	if (alt) return alt;
	const host = spelled(site.replace(/^https?:\/\/(?:www\.)?/i, '').split(/[/?#]/)[0].split('.')[0]);
	const words = line.match(WORD) ?? [];
	if (host) {
		for (let i = 0; i < words.length; i++) {
			for (let n = Math.min(4, words.length - i); n >= 1; n--) {
				const phrase = words.slice(i, i + n).join(' ').replace(/[.,;:]+$/, '').replace(/['’]s$/, '');
				if (spelled(phrase) === host) return phrase;
			}
		}
	}
	// the capitalised words the line opens on, before its verb
	const lead: string[] = [];
	for (const word of line.split(/\s*[,(]\s*/)[0].split(/\s+/).slice(0, 4)) {
		if (VERB.test(word) || !/^[\p{Lu}\p{N}]/u.test(word)) break;
		lead.push(word);
	}
	const opening = lead.join(' ').replace(/['’]s$/, '').replace(/[.:;]+$/, '');
	return lead.length > 0 && lead.length <= 3 && !OPENER.test(lead[0]) ? opening : '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const status = card.match(STATUS)?.[1];
		// a quote or a note among the cards, not a company
		if (!status) continue;
		const site = unescape(card.match(SITE)?.[1] ?? '').trim();
		const name = nameOf(clean(card.match(LOGO)?.[1] ?? ''), clean(card.match(LINE)?.[1] ?? ''), site);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: status === 'exit' ? 'Exited' : '',
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('squareone: no companies on the portfolio page — the markup moved');
	}

	return companies;
}
