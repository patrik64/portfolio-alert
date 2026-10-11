import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://inovo.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// super, over a notion database: the portfolio page is a table, fifty rows
// shown and the rest behind "Load more", all of them in react's payload —
// the table's items, by id, and each row's record. a row gives the
// company's name, its site, its categories ("AI/Data Science", "EdTech"),
// where its founders are from ("Poland", "Ukraine"), the year and stage the
// fund came in at ("Seed", "post-Series-A"), the round's size, the
// co-investors and the partner on it. the website column says so where a
// company is gone ("RIP") or sold ("Acquired by Commsor"), the name then
// linking its site. the categories, the origins, the stage and the year
// are kept as tags, a sale as "Acquired by …" with the Exited tag, a
// company gone with the Closed tag; a row the fund keeps "Undisclosed" is
// left out, as it names no one.
//
// the payload arrives as a run of javascript string literals that have to
// be unescaped and joined before the json inside them can be read; the
// columns are found by their names, their ids being notion's own.

const CHUNK = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
// a column of the table: its id, its name and its type
const COLUMN = /\{"id":"((?:[^"\\]|\\.)*)","name":"((?:[^"\\]|\\.)*)","type":"\w+"/g;
const ITEMS = /"items":(\["[^"\]]+"(?:,"[^"\]]+")*\])/;
const BUYER = /^acquired by\s+(.+)$/i;
const GONE = /^(?:rip|closed|dead|defunct)$/i;
const UNDISCLOSED = /^(?:undisclosed|stealth\b)/i;
const UNSAID = /^(?:-|other|others|all|n\/a|undisclosed)$/i;

// notion's rich text: runs of text, each with its marks, a link among them
type Rich = [string, [string, string?][]?][];
type Pill = { value?: string };

interface Row {
	title?: Rich;
	propertyValues?: Record<string, Rich | Pill[] | undefined>;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const textOf = (rich: Rich | undefined) => clean((rich ?? []).map(([text]) => text).join(''));
const linkOf = (rich: Rich | undefined) =>
	(rich ?? []).flatMap(([, marks]) => marks ?? []).find(([mark]) => mark === 'a')?.[1] ?? '';
const pillsOf = (pills: Pill[] | undefined) =>
	(Array.isArray(pills) ? pills : []).map((pill) => clean(pill?.value ?? '')).filter(Boolean);

// the json value opening at start — an object or an array — up to its close
function jsonAt(text: string, start: number): unknown {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < text.length; i++) {
		const c = text[i];
		if (escaped) escaped = false;
		else if (c === '\\') escaped = true;
		else if (c === '"') inString = !inString;
		else if (!inString) {
			if (c === '{' || c === '[') depth++;
			else if ((c === '}' || c === ']') && --depth === 0) {
				try {
					return JSON.parse(text.slice(start, i + 1));
				} catch {
					return undefined;
				}
			}
		}
	}
	return undefined;
}

const site = (href: string) => (/^https?:\/\/[\w-]+(\.[\w-]+)+/i.test(href) ? href : '');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const payload = [...html.matchAll(CHUNK)].map(([, literal]) => JSON.parse(literal) as string).join('');

	// the columns, by name, and the table's rows, in its order
	const columns = new Map<string, string>();
	for (const [, id, name] of payload.matchAll(COLUMN)) {
		const key = (JSON.parse(`"${name}"`) as string).toLowerCase();
		if (!columns.has(key)) columns.set(key, JSON.parse(`"${id}"`) as string);
	}
	const items = JSON.parse(payload.match(ITEMS)?.[1] ?? '[]') as string[];
	if (items.length === 0 || !columns.has('website')) {
		throw new Error("inovo: the page's payload carries no portfolio table — the page moved");
	}
	const column = (row: Row, name: string) => row.propertyValues?.[columns.get(name) ?? ''];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const id of items) {
		const key = JSON.stringify(id);
		const at = payload.indexOf(`${key}:{"id":${key}`);
		const row = at < 0 ? undefined : (jsonAt(payload, at + key.length + 1) as Row | undefined);
		// a row the table lists but the payload does not carry would go missing
		if (!row) {
			throw new Error(`inovo: the table lists a row the payload does not carry (${id})`);
		}
		const name = textOf(row.title);
		if (!name || UNDISCLOSED.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const website = column(row, 'website') as Rich | undefined;
		const said = textOf(website);
		const buyer = said.match(BUYER)?.[1];
		const gone = GONE.test(said);
		const year = pillsOf(column(row, 'entry') as Pill[]).join(' ').match(/\b(?:19|20)\d{2}\b/)?.[0];
		companies.push({
			name,
			category: [
				...pillsOf(column(row, 'category') as Pill[]).map(tag),
				...pillsOf(column(row, "founders' origin") as Pill[]).map(tag),
				...pillsOf(column(row, 'entry stage') as Pill[]).map(tag),
				year ? `Invested ${year}` : '',
				buyer ? `Acquired by ${tag(buyer)}` : '',
				buyer ? 'Exited' : '',
				gone ? 'Closed' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: (buyer || gone ? '' : site(linkOf(website))) || site(linkOf(row.title)) || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error("inovo: the portfolio table names no companies");
	}

	return companies;
}
