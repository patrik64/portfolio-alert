import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.graniteasia.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js on vercel over a headless wordpress: the portfolio is drawn in the
// browser from the posts the server sends along in its flight data — each
// with the company's name, its site and the fund's categories for it, the
// sectors and, for the companies the fund is out of, "IPO" or "Acquired",
// which is kept with the Exited tag.

const PUSH = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
const POSTS = '"posts":[';
const EXITS = /^(ipo|acquired|merged|exited)$/i;
const STEALTH = /^stealth\b/i;

interface Post {
	title?: string;
	url?: string;
	categories?: { title?: string }[];
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// the posts array, read to its closing bracket
function posts(flight: string): Post[] {
	const at = flight.indexOf(POSTS);
	if (at < 0) return [];
	const start = at + POSTS.length - 1;
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < flight.length; i++) {
		const c = flight[i];
		if (inString) {
			if (escaped) escaped = false;
			else if (c === '\\') escaped = true;
			else if (c === '"') inString = false;
			continue;
		}
		if (c === '"') inString = true;
		else if (c === '[' || c === '{') depth++;
		else if (c === ']' || c === '}') {
			depth--;
			if (depth === 0) return JSON.parse(flight.slice(start, i + 1)) as Post[];
		}
	}
	return [];
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const flight = [...html.matchAll(PUSH)].map((m) => JSON.parse(`"${m[1]}"`) as string).join('');

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const post of posts(flight)) {
		const name = clean(post.title ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const labels = (post.categories ?? []).map((c) => tag(c.title ?? '')).filter(Boolean);
		const exits = labels.filter((l) => EXITS.test(l));
		companies.push({
			name,
			category: [...labels.filter((l) => !EXITS.test(l)), ...exits, exits.length ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: unescape(post.url ?? '').trim()
		});
	}

	if (companies.length === 0) {
		throw new Error('graniteasia: no portfolio posts in the page — the layout moved');
	}

	return companies;
}
