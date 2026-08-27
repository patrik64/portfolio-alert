<script lang="ts">
	import { FUNDS } from '../../shared/funds';
	import { ScrapeController } from '../../shared/ScrapeController';

	let companyCount = $state(0);

	$effect(() => {
		ScrapeController.countCompanies().then((n) => (companyCount = n));
	});
</script>

<svelte:head>
	<title>about — portfolio alert</title>
</svelte:head>

<div class="mx-auto mt-2 w-full max-w-[53rem] px-6 py-4 lg:dashed-frame">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-lg font-semibold">about</h1>
		<!-- a company backed by several funds is counted once -->
		<span class="text-sm text-gray-900">
			{FUNDS.length} funds
			{#if companyCount > 0}
				· {companyCount.toLocaleString()} companies
			{/if}
		</span>
	</div>

	<div class="mt-4 flex flex-col gap-4 text-sm text-black">
    	<p>
            Hi, my name is Patrik Simic - <a href="https://www.github.com/patrik64" class="font-semibold text-black transition duration-150 hover:text-white">github.com/patrik64</a>
            and I created this app to help me find new work.
        </p>
        <p> If you have some ideas/suggestions how to improve this app,
            feel free to send me an email (the email address is on my github page).
    	</p>
		<p>
			<span class="font-semibold">portfolio alert</span> tracks the portfolio companies of
			{FUNDS.length} venture capital and private equity funds. It reads each fund's public
			portfolio page, keeps every company it has ever seen, and highlights
			<a href="/newcomers" class="font-semibold text-black transition duration-150 hover:text-white">newcomers</a> — companies
			that appeared in a fund's portfolio since the last fetch.
		</p>
		<p>
			The <a href="/" class="font-semibold text-black transition duration-150 hover:text-white">dashboard</a> shows one card per
			fund with its company count, newcomer badge and last-fetch time. The first fetch of a
			fund imports a baseline and is not counted as newcomers. Every company row shows when
			it was first encountered.
		</p>
		<p>
			<a href="/search" class="font-semibold text-black transition duration-150 hover:text-white">search</a> finds companies
			across every fund by name or category, and
			<a href="/timeline" class="font-semibold text-black transition duration-150 hover:text-white">timeline</a> groups them by
			the day they first appeared.
		</p>
		<p>
			Every night the funds are refreshed automatically, and whatever newcomers turn up are
			announced on bluesky at
			<a
				href="https://bsky.app/profile/portfolio-alert.bsky.social"
				target="_blank"
				rel="external noreferrer"
				class="font-semibold text-black transition duration-150 hover:text-white">@portfolio-alert.bsky.social</a
			>
			and in the
			<a href="/rss.xml" target="_blank" class="font-semibold text-black transition duration-150 hover:text-white">rss feed</a>.
		</p>
		<p>
			Built with SvelteKit, Svelte 5, remult and Tailwind CSS on a Supabase postgres database.
			The source is on
			<a
				href="https://github.com/patrik64/portfolio-alert"
				target="_blank"
				rel="external noreferrer"
				class="font-semibold text-black transition duration-150 hover:text-white">github</a
			>.
		</p>
	</div>
</div>
