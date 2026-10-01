import type { ScrapedCompany } from './types';

const BASE_URL = 'https://cortical.vc';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const API_URL = `${BASE_URL}/wp-json/wp/v2/portfolio_logos?per_page=100&_fields=id,title`;
// siteground's firewall answers 403 to chrome user-agent strings, as it does
// for helios and stray dog, and lets through a request that says plainly
// who is asking: so this one does, and wears nothing else. an address the
// firewall distrusts gets its captcha page whatever it says, and then the
// run fails saying so
const UA = 'portfolio-alert/1.0 (+https://portfolio-alert.vercel.app)';

// wordpress on bricks, the portfolio a wall of logos in tabs: "Show all",
// and one for each of the fund's themes, every tab a listing of the same
// posts. a logo links the company's site and says nothing else — half the
// alt texts are empty — but each is a post with a number, and the rest api
// lists those posts with their titles, which are the companies' names. so
// the page is read for who is on the wall, where each lives and which
// themes' tabs it hangs in, and the api for what each is called; a logo
// the api does not name is left out rather than named by guess. a green dot
// marks the ones "Exited / IPO / Merged or Acquired", which link nowhere.

// a tab: the pane it opens, and its label
const TAB = /<div\b[^>]*\brole="tab"[^>]*\baria-controls="([^"]+)"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
const PANE = /(?=<div\b[^>]*\brole="tabpanel")/;
const PANE_ID = /^<div\b[^>]*\bid="([^"]+)"/;
const ITEM = /(?=<div class="jet-listing-grid__item\b)/;
const POST = /\bdata-post-id="(\d+)"/;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const DOT = /class="[^"]*\bbadge\b[^"]*"/;
// the tab that shows every company names no theme
const ALL = /^(?:show\s+)?all\b/i;
const STEALTH = /^stealth\b/i;

interface Post {
	id?: number;
	title?: { rendered?: string };
}

interface Logo {
	site: string;
	exited: boolean;
	themes: string[];
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

// an answer that is the site's, or an error saying what the firewall said;
// the firewall's mind changes, so it is asked once more after a wait
async function get(url: string): Promise<Response> {
	for (let attempt = 0; ; attempt++) {
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (resp.ok && resp.status !== 202) return resp;
		const body = await resp.text();
		if (attempt === 0) {
			await new Promise((resolve) => setTimeout(resolve, 10_000));
			continue;
		}
		const title = clean(body.match(/<title[^>]*>([^<]*)</)?.[1] ?? '');
		throw new Error(
			`cortical: ${url} answered ${resp.status}${title ? ` "${title}"` : ''}` +
				(/sgcaptcha/i.test(body) ? ", siteground's captcha" : '')
		);
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await (await get(PAGE_URL)).text();
	const labels = new Map([...html.matchAll(TAB)].map(([, pane, label]) => [pane, tag(label)]));

	// the logos by their posts' numbers, in the order the wall first shows them
	const logos = new Map<number, Logo>();
	for (const pane of html.split(PANE).slice(1)) {
		const theme = labels.get(pane.match(PANE_ID)?.[1] ?? '') ?? '';
		for (const chunk of pane.split(ITEM).slice(1)) {
			// an item is one section; what follows the last of them is not its own
			const item = chunk.slice(0, chunk.indexOf('</section>') + 1 || undefined);
			const post = Number(item.match(POST)?.[1]);
			if (!post) continue;
			const logo = logos.get(post) ?? { site: '', exited: false, themes: [] };
			logo.site ||= unescape(item.match(LINK)?.[1] ?? '').trim();
			logo.exited ||= DOT.test(item);
			if (theme && !ALL.test(theme) && !logo.themes.includes(theme)) logo.themes.push(theme);
			logos.set(post, logo);
		}
	}
	if (logos.size === 0) {
		throw new Error(
			'cortical: no logos on the portfolio page' + (/sgcaptcha/i.test(html) ? " — siteground's captcha" : '')
		);
	}

	const names = new Map<number, string>();
	for (let page = 1, pages = 1; page <= pages && page <= 20; page++) {
		const resp = await get(`${API_URL}&page=${page}`);
		const body = await resp.text();
		let posts: Post[];
		try {
			posts = JSON.parse(body) as Post[];
		} catch {
			// the captcha comes under a 2xx status too
			throw new Error(
				'cortical: the rest api answered no list of posts' +
					(/sgcaptcha/i.test(body) ? " — siteground's captcha" : '')
			);
		}
		for (const post of posts) {
			if (post.id) names.set(post.id, clean(post.title?.rendered ?? ''));
		}
		pages = Number(resp.headers.get('x-wp-totalpages') ?? '1') || 1;
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [post, logo] of logos) {
		const name = names.get(post) ?? '';
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: [...logo.themes, logo.exited ? 'Exited' : ''].filter(Boolean).join(', '),
			url: logo.site || PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('cortical: the rest api names none of the logos on the portfolio page');
	}

	return companies;
}
