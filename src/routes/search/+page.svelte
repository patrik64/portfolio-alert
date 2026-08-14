<script lang="ts">
	import { fundName } from '../../shared/funds';
	import { ScrapeController, SEARCH_LIMIT, type SearchHit } from '../../shared/ScrapeController';

	let search = $state('');
	let results = $state<SearchHit[]>([]);
	let searching = $state(false);
	let searched = $state(false);
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
			return;
		}
		searching = true;
		// debounce; the cleanup cancels the pending query when the user keeps typing
		const timer = setTimeout(async () => {
			const rows = await ScrapeController.searchCompanies(q);
			if (q === search.trim()) {
				results = rows;
				searching = false;
				searched = true;
			}
		}, 250);
		return () => clearTimeout(timer);
	});
</script>

<svelte:head>
	<title>search — portfolio alert</title>
</svelte:head>

<div
	class="mx-auto mt-2 w-full max-w-[53rem] px-6 py-4 lg:dashed-frame"
>
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-lg font-semibold">search</h1>
		<span class="text-sm text-gray-600">
			{#if searching}
				searching…
			{:else if searched}
				{results.length === SEARCH_LIMIT
					? `first ${SEARCH_LIMIT} matches`
					: `${results.length} matches`}
			{:else if total}
				({total.toLocaleString()} companies)
			{/if}
		</span>
	</div>

	<!-- svelte-ignore a11y_autofocus -->
	<input
		type="text"
		placeholder='search all companies by name or category… wrap in "quotes" for exact matches'
		bind:value={search}
		autofocus
		class="form-input mt-3 w-full focus:shadow-outline-green"
	/>

	{#if !searched && !searching}
		<p class="mt-6 text-sm text-gray-600">type at least 2 characters to search all companies</p>
	{:else if searched && results.length === 0}
		<p class="mt-6 text-sm text-gray-600">no companies match "{search.trim()}"</p>
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
								class="font-medium text-gray-800 transition duration-150 hover:text-tertiary-600"
							>
								{company.name}
							</a>
						{:else}
							<span class="font-medium text-gray-800">{company.name}</span>
						{/if}
						{#if company.category}
							<span class="ml-2 text-xs text-gray-500">{company.category}</span>
						{/if}
					</div>
					<div class="flex shrink-0 items-center gap-3 text-xs text-gray-500">
						<a
							href={`/funds/${company.fundSlug}`}
							class="font-semibold transition duration-150 hover:text-tertiary-600"
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
		</ul>
	{/if}
</div>
