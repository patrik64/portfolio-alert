// Announces the newcomers of a nightly fetch on Bluesky. Reads the result file
// fetch-all.mjs writes, asks the API which companies the funds gained in that
// run, and publishes one post — or a short thread when the list is long. Plain
// Node over the AT Protocol XRPC endpoints, no dependencies.
//
//   node scripts/post-newcomers.mjs --dry-run    compose and print, post nothing
//   node scripts/post-newcomers.mjs              compose and post
//   node scripts/post-newcomers.mjs --current    ...announcing whatever the
//                                                newcomers page shows instead
//   node scripts/post-newcomers.mjs --check      prove the credentials work
//
// Credentials come from the environment:
//   BLUESKY_IDENTIFIER    handle or did (default portfolio-alert.bsky.social)
//   BLUESKY_APP_PASSWORD  an app password from bsky settings — never the
//                         account password itself

import { readFileSync } from 'node:fs';

const BASE_URL = process.env.BASE_URL ?? 'https://portfolio-alert.vercel.app';
const SERVICE = process.env.BLUESKY_SERVICE ?? 'https://bsky.social';
const IDENTIFIER = process.env.BLUESKY_IDENTIFIER ?? 'portfolio-alert.bsky.social';
const PASSWORD = process.env.BLUESKY_APP_PASSWORD;

const NEWCOMERS_URL = `${BASE_URL}/newcomers`;
const NEWCOMERS_LABEL = NEWCOMERS_URL.replace(/^https?:\/\//, '');
// bluesky counts graphemes, not characters, and stops at 300
const POST_LIMIT = 300;
// beyond a short thread the naming turns into a count per fund instead
const MAX_POSTS = 3;

const arg = (name) => {
	const found = process.argv.find((a) => a === name || a.startsWith(`${name}=`));
	return found?.includes('=') ? found.slice(found.indexOf('=') + 1) : undefined;
};

const DRY_RUN = process.argv.includes('--dry-run');
const RESULTS_FILE = arg('--results') ?? 'fetch-results.json';

const segmenter = new Intl.Segmenter();
const graphemes = (s) => [...segmenter.segment(s)].length;

// a post is assembled from parts because bluesky addresses its rich text by
// utf-8 byte offset — recording the parts as they land is cheaper and safer
// than searching the finished string for the pieces that should be links
class Post {
	constructor(limit) {
		this.limit = limit;
		this.parts = [];
		this.hasBody = false;
	}

	get text() {
		return this.parts.map((p) => p.text).join('');
	}

	get length() {
		return graphemes(this.text);
	}

	fits(text) {
		return graphemes(this.text + text) <= this.limit;
	}

	add(text, uri) {
		this.parts.push({ text, uri });
		return this;
	}

	facets() {
		const encoder = new TextEncoder();
		const facets = [];
		let offset = 0;
		for (const part of this.parts) {
			const bytes = encoder.encode(part.text).length;
			if (part.uri) {
				facets.push({
					index: { byteStart: offset, byteEnd: offset + bytes },
					features: [{ $type: 'app.bsky.richtext.facet#link', uri: part.uri }]
				});
			}
			offset += bytes;
		}
		return facets;
	}
}

const headline = (total) => `${total} new portfolio ${total === 1 ? 'company' : 'companies'}`;

// a fund's heading opens right after the headline, a blank line under the
// previous group, or at the very top when it has been carried over into a
// fresh post; its companies follow as bullet lines
const openLine = (post, fund) => `${post.parts.length === 0 ? '' : '\n\n'}${fund}:`;

// every company by name on its own bullet line, each linking to its own site
function composeDetailed(groups, total) {
	const footer = graphemes(`\n\n${NEWCOMERS_LABEL}`);
	const posts = [];
	let post = new Post(POST_LIMIT - footer).add(headline(total));

	for (const group of groups) {
		let open = false;
		for (const company of group.companies) {
			const uri = company.url.startsWith('http') ? company.url : undefined;
			const lead = `${open ? '' : openLine(post, group.name)}\n• `;
			if (!post.fits(lead + company.name)) {
				// the post is full — carry the rest of the group into a new one
				posts.push(post);
				post = new Post(POST_LIMIT);
				post.add(`${openLine(post, group.name)}\n• `);
			} else {
				post.add(lead);
			}
			post.hasBody = true;
			post.add(company.name, uri);
			open = true;
		}
	}
	posts.push(post);
	posts[0].add('\n\n').add(NEWCOMERS_LABEL, NEWCOMERS_URL);
	return posts;
}

// a flood day (a fresh yc batch, say) reads better as counts than as a wall of
// names, and fits in a single post
function composeSummary(groups, total) {
	const footer = graphemes(`\n\n${NEWCOMERS_LABEL}`);
	const post = new Post(POST_LIMIT - footer).add(headline(total));
	const more = (n) => `\n+${n} more fund${n === 1 ? '' : 's'}`;

	let shown = 0;
	for (const group of groups) {
		const line = `${post.hasBody ? '\n' : '\n\n'}${group.name}: ${group.companies.length}`;
		const rest = groups.length - shown - 1;
		if (!post.fits(line + (rest > 0 ? more(rest) : ''))) break;
		post.add(line);
		post.hasBody = true;
		shown++;
	}
	if (shown < groups.length) post.add(more(groups.length - shown));

	post.add('\n\n').add(NEWCOMERS_LABEL, NEWCOMERS_URL);
	return [post];
}

async function login() {
	const resp = await fetch(`${SERVICE}/xrpc/com.atproto.server.createSession`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ identifier: IDENTIFIER, password: PASSWORD })
	});
	if (!resp.ok) {
		// the body echoes the identifier but never the password
		throw new Error(`bluesky login failed: ${resp.status} ${(await resp.text()).slice(0, 200)}`);
	}
	return resp.json();
}

async function publish(session, post, reply) {
	const record = {
		$type: 'app.bsky.feed.post',
		text: post.text,
		createdAt: new Date().toISOString(),
		langs: ['en']
	};
	const facets = post.facets();
	if (facets.length) record.facets = facets;
	if (reply) record.reply = reply;

	const resp = await fetch(`${SERVICE}/xrpc/com.atproto.repo.createRecord`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${session.accessJwt}`
		},
		body: JSON.stringify({ repo: session.did, collection: 'app.bsky.feed.post', record })
	});
	if (!resp.ok) {
		throw new Error(`bluesky post failed: ${resp.status} ${(await resp.text()).slice(0, 200)}`);
	}
	return resp.json();
}

async function api(path) {
	const resp = await fetch(`${BASE_URL}/api/${path}`);
	if (!resp.ok) throw new Error(`GET /api/${path.split('?')[0]} — ${resp.status}`);
	return resp.json();
}

const asCompanies = (rows) => rows.map((c) => ({ name: c.name, url: c.url ?? '' }));

// what the run recorded in the results file, fund by fund
async function groupsFromResults() {
	let results;
	try {
		results = JSON.parse(readFileSync(RESULTS_FILE, 'utf8'));
	} catch {
		console.log(`no fetch results at ${RESULTS_FILE} — nothing to announce`);
		process.exit(0);
	}

	// only the funds that gained something in *this* run: a fund whose scrape
	// failed still carries the newcomer flags of whenever it last succeeded
	const gained = results.filter((r) => r.added > 0);
	if (gained.length === 0) {
		console.log('no newcomers in the last fetch — staying quiet');
		process.exit(0);
	}

	const groups = [];
	for (const fund of gained) {
		const query = `fundSlug=${encodeURIComponent(fund.slug)}&isNewcomer=true&_limit=1000`;
		let rows;
		try {
			rows = await api(`companies?${query}`);
		} catch (err) {
			console.log(`skipping ${fund.slug}: ${err.message}`);
			continue;
		}
		if (rows.length === 0) continue;
		groups.push({ name: fund.name || fund.slug, companies: asCompanies(rows) });
	}
	return groups;
}

// everything the newcomers page is showing, whichever run turned it up — for
// announcing by hand
async function groupsFromNewcomers() {
	const [rows, funds] = await Promise.all([
		api('companies?isNewcomer=true&_limit=100000'),
		api('funds?_limit=1000')
	]);
	const names = new Map(funds.map((f) => [f.slug, f.name]));

	const byFund = new Map();
	for (const row of rows) {
		if (!byFund.has(row.fundSlug)) byFund.set(row.fundSlug, []);
		byFund.get(row.fundSlug).push(row);
	}
	return [...byFund].map(([slug, rows]) => ({
		name: names.get(slug) || slug,
		companies: asCompanies(rows)
	}));
}

// proves the app password works without saying anything out loud
if (process.argv.includes('--check')) {
	if (!PASSWORD) {
		console.error('BLUESKY_APP_PASSWORD is not set');
		process.exit(1);
	}
	const session = await login();
	console.log(`signed in to bluesky as @${session.handle} (${session.did})`);
	process.exit(0);
}

const groups = process.argv.includes('--current')
	? await groupsFromNewcomers()
	: await groupsFromResults();

if (groups.length === 0) {
	console.log('nothing to announce — staying quiet');
	process.exit(0);
}

// the loudest funds first
groups.sort((a, b) => b.companies.length - a.companies.length || a.name.localeCompare(b.name));
const total = groups.reduce((n, g) => n + g.companies.length, 0);

const detailed = composeDetailed(groups, total);
const posts =
	detailed.length <= MAX_POSTS && detailed.every((p) => p.length <= POST_LIMIT)
		? detailed
		: composeSummary(groups, total);

for (const [i, post] of posts.entries()) {
	console.log(`--- post ${i + 1}/${posts.length} (${post.length} graphemes)\n${post.text}\n`);
	if (!DRY_RUN) continue;
	// read the links back out of the finished text the way bluesky will
	const bytes = new TextEncoder().encode(post.text);
	for (const facet of post.facets()) {
		const label = new TextDecoder().decode(bytes.slice(facet.index.byteStart, facet.index.byteEnd));
		console.log(`    link ${JSON.stringify(label)} -> ${facet.features[0].uri}`);
	}
	console.log();
}

if (DRY_RUN) {
	console.log('dry run — nothing was posted');
	process.exit(0);
}
if (!PASSWORD) {
	console.log('BLUESKY_APP_PASSWORD is not set — nothing was posted');
	process.exit(0);
}

const session = await login();
let root;
let parent;
for (const post of posts) {
	const reply = root ? { root, parent } : undefined;
	const created = await publish(session, post, reply);
	root ??= { uri: created.uri, cid: created.cid };
	parent = { uri: created.uri, cid: created.cid };
}

const url = `https://bsky.app/profile/${session.handle}/post/${root.uri.split('/').pop()}`;
console.log(`posted ${posts.length === 1 ? 'to' : `a ${posts.length}-post thread on`} bluesky: ${url}`);

if (process.env.GITHUB_STEP_SUMMARY) {
	const { appendFileSync } = await import('node:fs');
	appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n[announced ${total} on bluesky](${url})\n`);
}
