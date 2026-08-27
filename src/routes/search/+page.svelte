<script lang="ts">
	import { fundName } from '../../shared/funds';
	import { ScrapeController, SEARCH_LIMIT, type SearchHit } from '../../shared/ScrapeController';

	let search = $state('');
	let results = $state<SearchHit[]>([]);
	let searching = $state(false);
	let searched = $state(false);
	// the last batch came back full, so another one may be waiting
	let hasMore = $state(false);
	let loadingMore = $state(false);
	let total = $state(0);

	$effect(() => {
		// a company backed by several funds is counted once
		ScrapeController.countCompanies().then((n) => (total = n));
	});

	$effect(() => {
		const q = search.trim();
		if (q.length < 2) {
			results = [];
			searching = false;
			searched = false;
			hasMore = false;
			return;
		}
		searching = true;
		// debounce; the cleanup cancels the pending query when the user keeps typing
		const timer = setTimeout(async () => {
			const rows = await ScrapeController.searchCompanies(q);
			if (q === search.trim()) {
				results = rows;
				hasMore = rows.length === SEARCH_LIMIT;
				searching = false;
				searched = true;
			}
		}, 250);
		return () => clearTimeout(timer);
	});

	async function loadMore() {
		const q = search.trim();
		loadingMore = true;
		const rows = await ScrapeController.searchCompanies(q, results.length);
		// the query may have changed while the batch was in flight
		if (q === search.trim()) {
			const known = new Set(results.map((r) => r.id));
			results = [...results, ...rows.filter((r) => !known.has(r.id))];
			hasMore = rows.length === SEARCH_LIMIT;
		}
		loadingMore = false;
	}
</script>

<svelte:head>
	<title>search — portfolio alert</title>
</svelte:head>

<div
	class="mx-auto mt-2 w-full max-w-[53rem] px-6 py-4 lg:dashed-frame"
>
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-lg font-semibold">search</h1>
		<span class="text-sm text-gray-900">
			{#if searching}
				searching…
			{:else if searched}
				{hasMore
					? `first ${results.length.toLocaleString()} matches`
					: `${results.length.toLocaleString()} matches`}
			{:else if total}
				({total.toLocaleString()} companies)
			{/if}
		</span>
	</div>

	<!-- svelte-ignore a11y_autofocus -->
	<input
		type="text"
		placeholder="search all companies by name or category…"
		bind:value={search}
		autofocus
		class="form-input mt-3 w-full focus:shadow-outline-gray"
	/>

	{#if !searched && !searching}
		<ul class="mt-6 ml-5 flex list-disc flex-col gap-1.5 text-sm text-gray-900">
			<li>
				a term in "quotes" matches exactly: a company named exactly that, or a whole category tag
			</li>
			<li>
				uppercase <span class="font-semibold">AND</span> and
				<span class="font-semibold">OR</span> combine terms, AND binding tighter — ai AND health,
				fintech OR insurtech
			</li>
			<li>type at least 2 characters to search all companies</li>
		</ul>
	{:else if searched && results.length === 0}
		<p class="mt-6 text-sm text-gray-900">no companies match "{search.trim()}"</p>
	{:else if results.length > 0}
		<ul class="mt-4 divide-y divide-gray-200 rounded-lg bg-white shadow-lg">
			{#each results as company (company.id)}
				<li class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2">
					<div class="min-w-0">
						{#if company.url.startsWith('http')}
							<a
								href={company.url}
								target="_blank"
								rel="noopener noreferrer"
								class="font-medium text-gray-800 transition duration-150 hover:underline"
							>
								{company.name}
							</a>
						{:else}
							<span class="font-medium text-gray-800">{company.name}</span>
						{/if}
						{#if company.category}
							<span class="ml-2 text-xs text-gray-900">{company.category}</span>
						{/if}
					</div>
					<div class="flex shrink-0 items-center gap-3 text-xs text-gray-900">
						<a
							href={`/funds/${company.fundSlug}`}
							class="font-semibold transition duration-150 hover:underline"
						>
							{fundName.get(company.fundSlug) ?? company.fundSlug}
						</a>
						<span>
						first seen {company.firstSeenAt
							? new Date(company.firstSeenAt).toLocaleDateString()
							: ''}
					</span>
					</div>
				</li>
			{/each}
			{#if hasMore}
				<li>
					<button
						type="button"
						onclick={loadMore}
						disabled={loadingMore}
						class="w-full cursor-pointer px-4 py-2 text-center text-sm font-semibold text-black transition duration-150 hover:underline disabled:cursor-default disabled:text-gray-400"
					>
						{loadingMore ? 'loading…' : `show ${SEARCH_LIMIT} more`}
					</button>
				</li>
			{/if}
		</ul>
	{/if}
</div>
