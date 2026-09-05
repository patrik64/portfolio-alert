import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://nextview.vc/investments/all/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress on the fund's own theme. the page is a wall of logos over a panel
// per company, and both are served whole — the panels are in the html whether
// or not one is opened.
//
// nowhere in either does the fund print a company's name. a panel gives the
// year it was founded, the year the fund came in, a sentence, a place and the
// areas it invests under, and a Visit Website button — but no heading. so the
// name is taken from the sentence, which opens on it four times out of five,
// and from the file the logo was uploaded under, and neither is believed
// unless it comes to the slug the fund files the company under or to the host
// of the company's own address. where neither does, the slug is the name: it
// is the fund's own word for the company too, only less carefully spelt.
//
// asking for that agreement is what saves the entry filed under gopuff, whose
// panel carries another company's logo and another company's sentence: the
// sentence names Bandit, gopuff.com does not agree, and the fund's own slug
// wins.
//
// the theme leaves a closing div inside an html comment, so the comments are
// taken out before anything is read — with them in, an investment area runs on
// to the end of the panel.
//
// which companies have gone is on the wall rather than in the panel, as a
// badge over the logo, so the wall is read for that and joined on the same
// slug. one thing on the wall is a subscribe form rather than a company, and
// it has no panel, which is what tells it apart.

const COMMENT = /<!--[\s\S]*?-->/g;
const TILE = /data-page-target="([^"]+)"([\s\S]*?)(?=data-page-target="|id="investments-modal")/g;
const PANEL = /<div id="([a-z0-9-]+)" class="modal-page investments-modal-content">/;
const EXITED = /class="exited"/;
const EXCERPT = /<h3 class="excerpt">([\s\S]*?)<\/h3>/;
const LOGO = /<img src="([^"]*)"[^>]*class="logo-image/;
const AREA = /Investment Area:<\/strong>([\s\S]*?)<\/div>/;
const PLACE = /Location:[\s\S]*?<\/strong>\s*<\/div>\s*<div class="info-data">([\s\S]*?)<\/div>/;
const SITE = /<a class="btn[^"]*"[^>]*href="([^"]*)"/;
// what a slug carries that a name does not
const INCORPORATION = /-(inc|llc|co|corp|ltd)$/;
// the size wordpress adds to a scaled image, and the copy number
const SCALED = /-\d+x\d+$/;
const COUNTER = /-\d+$/;

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => un(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, and the fund writes its areas that way too, so
// they are split on it rather than run together
const tags = (s: string) =>
	clean(s)
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean);

// a name and a slug are compared on their letters and digits alone
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// a slug read as a name: its hyphens are spaces and its words take a capital.
// AI is the one initialism worth putting back, since the fund files three
// companies under it and none of them is called Ai
const fromSlug = (slug: string) =>
	slug
		.replace(/-/g, ' ')
		.replace(/(^|\s)([a-z])/g, (_, before, letter) => before + letter.toUpperCase())
		.replace(/\bAi\b/g, 'AI')
		.replace(/(?!^)\b(Of|And|The)\b/g, (word) => word.toLowerCase())
		.trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = (await resp.text()).replace(COMMENT, '');

	// which companies the wall badges as gone
	const gone = new Map<string, boolean>();
	for (const [, slug, tile] of html.matchAll(TILE)) gone.set(slug, EXITED.test(tile));

	const panels = html.split(PANEL);
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	// split() hands back [before, slug, panel, slug, panel, …]
	for (let at = 1; at + 1 < panels.length; at += 2) {
		const slug = panels[at];
		const panel = panels[at + 1];
		const base = slug.replace(INCORPORATION, '');

		const sentence = clean(panel.match(EXCERPT)?.[1] ?? '');
		const words = sentence.split(' ').filter(Boolean);
		const stem = decodeURIComponent((panel.match(LOGO)?.[1] ?? '').split('/').pop() ?? '')
			.replace(/\.[a-z0-9]+$/i, '')
			.replace(SCALED, '')
			.replace(COUNTER, '');

		const site = clean(panel.match(SITE)?.[1] ?? '');
		const host = site
			.replace(/^https?:\/\//, '')
			.split('/')[0]
			.replace(/^www\./, '');
		// a host agrees with a name either whole or without its ending, since
		// some of these companies are called after the ending too
		const agrees = new Set(
			[slug, base, host, host.replace(/\.[a-z]+$/i, '')].map(key).filter(Boolean)
		);

		const candidates = [
			...[4, 3, 2, 1]
				.filter((n) => words.length >= n)
				.map((n) => words.slice(0, n).join(' ').replace(/[,.:]+$/, '').replace(/['’]s$/i, '')),
			clean(stem)
		];
		const name = candidates.find((candidate) => agrees.has(key(candidate))) ?? fromSlug(base);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: [
				...tags(panel.match(AREA)?.[1] ?? ''),
				...tags(panel.match(PLACE)?.[1] ?? '').slice(0, 1),
				gone.get(slug) ? 'Acquired' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: site
		});
	}

	if (companies.length === 0) {
		throw new Error('nextview: no companies in the investments panels');
	}

	return companies;
}
