import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.newstack.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// strikingly ("Powered by Strikingly.com" in the first comment), one page with
// the portfolio as a section of it. the whole page is in a javascript object
// the platform writes out whole, so the section is taken from there by the
// name the fund gave it rather than out of the rendered grid: the page also
// carries a Co-Investors grid of logos that looks exactly the same, and only
// the name tells the two apart. if the section is ever renamed this stops with
// a complaint instead of quietly returning the wrong logos.
//
// a logo has no name attached and no sector, only a link to the company. six
// of them carry a caption, which is the fund's own word for the company and is
// taken as it stands. for the rest the address names the company, as for
// vu venture partners and worklife, which puts a few of them back together as
// one word: Rainwalkpetinsurance, Manifoldfreight, Enclavecoworking. they are
// at least steady, and that matters more here — a name that moved would read
// as the old company leaving and a new one arriving.
//
// steadiness is also why the fund's own news posts, which are on this page too
// and spell several of those names out, are left alone: the page holds only
// the most recent posts, so a name taken from one would change back as soon as
// the post it came from scrolled off. what the address says today it will
// still say next year.
//
// five logos are linked to nothing. they are the fund's stealth placeholders —
// the same drawing five times over, captioned STEALTH with a sector under it —
// and a company that has not been announced is not a newcomer to publish, so
// they are left out.

// what a company puts in front of its brand to get a free address
const DECORATION = /^(?:hello|hey|with|get|try|use|join|my|the)(?=[a-z]{3,})/;
// second levels that are not the brand — "mechasys.ca" is Mechasys
const GENERIC = new Set(['com', 'co', 'net', 'org', 'gov', 'edu', 'ac']);
// strikingly hangs six random characters off an uploaded file's own name
const UPLOAD_KEY = /_[a-z0-9]{5,8}$/;
// a file that spells a brand rather than the platform's numbering
const BRAND = /^[A-Za-z][A-Za-z0-9 &.'-]{2,}$/;
// a file that mixes cases knows a capital the address cannot hold
const mixed = (s: string) => /[a-z]/.test(s) && /[A-Z]/.test(s);

const clean = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// the same brand written two ways — spaces, capitals and dots set aside
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const capitalize = (s: string) => (/^[a-z]/.test(s) ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const fromHost = (url: string) => {
	const labels = new URL(url).hostname.replace(/^www\./, '').split('.');
	if (labels.length > 1) labels.pop();
	if (labels.length > 1 && GENERIC.has(labels[labels.length - 1])) labels.pop();
	return (labels[labels.length - 1] ?? '').replace(DECORATION, '');
};

interface Image {
	link_url?: string;
	caption?: string;
	storageKey?: string;
}
interface Item {
	components?: { media1?: { image?: Image } };
}
interface Section {
	components?: {
		slideSettings?: { name?: string };
		repeatable1?: { list?: Item[] };
	};
}
interface Store {
	pageData?: { pages?: { sections?: Section[] }[] };
}

// the object is written straight into the page, so it ends where its own
// braces balance rather than at any character that can be searched for
function readStore(html: string): Store {
	const opened = html.search(/\$S\.stores\s*=\s*\{/);
	if (opened === -1) throw new Error('newstack: the page no longer carries its own data');
	const from = html.indexOf('{', opened);
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let at = from; at < html.length; at++) {
		const c = html[at];
		if (inString) {
			if (escaped) escaped = false;
			else if (c === '\\') escaped = true;
			else if (c === '"') inString = false;
		} else if (c === '"') inString = true;
		else if (c === '{') depth++;
		else if (c === '}' && --depth === 0) {
			return JSON.parse(html.slice(from, at + 1)) as Store;
		}
	}
	throw new Error('newstack: the page data does not close');
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}

	const sections = readStore(await resp.text()).pageData?.pages?.flatMap((p) => p.sections ?? []);
	const portfolio = sections?.find(
		(s) => (s.components?.slideSettings?.name ?? '').trim().toLowerCase() === 'portfolio'
	);
	if (!portfolio) {
		throw new Error('newstack: the page has no section named Portfolio');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of portfolio.components?.repeatable1?.list ?? []) {
		const image = item.components?.media1?.image ?? {};
		const link = (image.link_url ?? '').trim();
		// the stealth placeholders, which are linked to nothing
		if (!link) continue;

		let url: string;
		let host: string;
		try {
			// a couple of the links are written without their scheme
			url = /^https?:\/\//i.test(link) ? link : `https://${link}`;
			host = fromHost(url);
		} catch {
			continue;
		}
		if (!host) continue;

		// what the file was uploaded as, where that is a brand and not a number
		const file = clean((image.storageKey ?? '').split('/').pop()?.replace(UPLOAD_KEY, '') ?? '');
		const spelled = BRAND.test(file) && key(file) === key(host) && mixed(file);

		const caption = clean(image.caption ?? '');
		const name = caption || (spelled ? file : capitalize(host));
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({ name, category: '', url });
	}

	if (companies.length === 0) {
		throw new Error('newstack: no companies in the portfolio section');
	}

	return companies;
}
