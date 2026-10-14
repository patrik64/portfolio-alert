import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.lumiraventures.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page is a grid of logos, the whole of it in the
// page, classed "current" or "exits", a logo a company named in its label
// ("Portfolio Image of Alpha-9 Oncology") and opening a panel kept beside
// it with a few lines about it, its industry, its headquarters ("Vancouver,
// BC - Boston, MA") and its site; an exit's lines say how it went ("…was
// acquired by Merit Medical Systems Inc. in February 2008"). the industry
// and the places are kept as tags, an exit with the Exited tag and its
// buyer or listing.

const TILE =
	/<div class="col-lg-3 col-sm-4 grid-item ([^"]*)">[\s\S]*?data-bs-target="#([^"]+)"\s+aria-label="([^"]*)"[\s\S]*?(?:<img\b[^>]*\balt="([^"]*)")?/g;
const PANEL = (id: string) =>
	new RegExp(`<div class="modal fade[^"]*" id="${id}"[\\s\\S]*?<div class="modal-member-desc">([\\s\\S]*?)</div>([\\s\\S]*?)</div>\\s*</div>\\s*</div>`);
const LABEL = /^portfolio image of\s+/i;
const FACT = (label: string) => new RegExp(`${label}:\\s*<b>([\\s\\S]*?)</b>`, 'i');
const SITE = /<a href="([^"]*)" class="modal-btn">/;
const EXITS = /\bexits?\b/i;
// "was acquired by Merit Medical Systems Inc. in February 2008"
const BUYER = /\bacquired by\s+(.+?)(?:\s+(?:in|for|on)\b.*|\.(?:\s.*|$)|[,;].*|$)/i;
const LISTED = /\b(?:initial public offering|IPO|went public|publicly listed)\b/;
const FORM = /[\s,]+(?:inc\.?|llc|ltd\.?|limited|corp\.?|ag|gmbh|sa|plc)$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// "Merit Medical Systems Inc." -> "Merit Medical Systems", "MAKO Surgical Corp" -> "MAKO Surgical"
const bare = (s: string) => {
	let name = clean(s);
	for (let before = ''; before !== name; ) {
		before = name;
		name = name.replace(FORM, '').trim();
	}
	return name || clean(s);
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const [, classes, id, label, alt] of html.matchAll(TILE)) {
		const name = bare(clean(label).replace(LABEL, '') || clean(alt ?? ''));
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const [, desc = '', footer = ''] = html.match(PANEL(id.replace(/[^\w-]/g, ''))) ?? [];
		// the lines about the company, before its industry and headquarters
		const lines = clean(desc.split(/Industry:/i)[0]);
		const exited = EXITS.test(classes);
		const buyer = exited ? bare(lines.match(BUYER)?.[1] ?? '') : '';
		const site = unescape(footer.match(SITE)?.[1] ?? '').trim();
		if (/^https?:\/\//i.test(site)) withSite++;
		companies.push({
			name,
			category: [
				tag(desc.match(FACT('Industry'))?.[1] ?? ''),
				...clean(desc.match(FACT('Headquarters'))?.[1] ?? '')
					.split(/\s+-\s+|,/)
					.map(tag),
				exited && LISTED.test(lines) ? 'IPO' : '',
				buyer ? `Acquired by ${tag(buyer)}` : '',
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('lumira: no companies in the portfolio grid — the markup moved');
	}
	if (withSite === 0) {
		throw new Error("lumira: no company's panel gave its site — the panels' markup moved");
	}

	return companies;
}
