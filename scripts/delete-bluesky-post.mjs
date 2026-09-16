// Deletes one post from the portfolio-alert Bluesky account — for taking back
// an announcement that turned out to be wrong (say, a scrape-variance flood
// counted as newcomers). Plain Node over the AT Protocol XRPC endpoints, no
// dependencies; credentials come from the environment like post-newcomers.mjs.
//
//   node scripts/delete-bluesky-post.mjs https://bsky.app/profile/<handle>/post/<rkey>
//   node scripts/delete-bluesky-post.mjs <rkey>

const SERVICE = process.env.BLUESKY_SERVICE ?? 'https://bsky.social';
const IDENTIFIER = process.env.BLUESKY_IDENTIFIER ?? 'portfolio-alert.bsky.social';
const PASSWORD = process.env.BLUESKY_APP_PASSWORD;

const arg = process.argv[2];
if (!arg) {
	console.error('usage: node scripts/delete-bluesky-post.mjs <post url or rkey>');
	process.exit(1);
}
if (!PASSWORD) {
	console.error('BLUESKY_APP_PASSWORD is not set');
	process.exit(1);
}
const rkey = arg.match(/\/post\/([a-z0-9]+)\/?$/)?.[1] ?? arg;
if (!/^[a-z0-9]+$/.test(rkey)) {
	console.error(`not a post url or rkey: ${arg}`);
	process.exit(1);
}

const resp = await fetch(`${SERVICE}/xrpc/com.atproto.server.createSession`, {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ identifier: IDENTIFIER, password: PASSWORD })
});
if (!resp.ok) {
	// the body echoes the identifier but never the password
	console.error(`bluesky login failed: ${resp.status} ${(await resp.text()).slice(0, 200)}`);
	process.exit(1);
}
const session = await resp.json();

const del = await fetch(`${SERVICE}/xrpc/com.atproto.repo.deleteRecord`, {
	method: 'POST',
	headers: {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${session.accessJwt}`
	},
	body: JSON.stringify({ repo: session.did, collection: 'app.bsky.feed.post', rkey })
});
if (!del.ok) {
	console.error(`delete failed: ${del.status} ${(await del.text()).slice(0, 200)}`);
	process.exit(1);
}
console.log(`deleted post ${rkey} from @${session.handle}`);
