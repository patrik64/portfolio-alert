<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import Footer from '$lib/components/Footer.svelte';
	import '../app.css';

	let { children } = $props();
	let menuOpen = $state(false);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>portfolio alert</title>
</svelte:head>

<svelte:window
	onclick={() => (menuOpen = false)}
	onkeydown={(e) => e.key === 'Escape' && (menuOpen = false)}
/>

<div class="flex min-h-screen flex-col">
	<div class="flex items-center p-2 select-none">
		<div class="relative">
			<button
				type="button"
				aria-label="menu"
				onclick={(e) => {
					e.stopPropagation();
					menuOpen = !menuOpen;
				}}
				class="flex h-8 w-8 items-center justify-center rounded-full border border-gray-600 transition duration-150 ease-in-out hover:bg-tertiary-500 focus:outline-none"
			>
				<svg width="20" height="20" viewBox="0 0 20 20" fill="gray">
					<path
						fill-rule="evenodd"
						d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
						clip-rule="evenodd"
					/>
				</svg>
			</button>
			{#if menuOpen}
				<div class="absolute left-0 z-10 mt-1 w-40 rounded-md bg-white py-1 shadow-lg shadow-xs">
					<a
						href="/"
						onclick={() => (menuOpen = false)}
						class="block px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
					>
						home
					</a>
					<a
						href="/newcomers"
						onclick={() => (menuOpen = false)}
						class="block px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
					>
						newcomers
					</a>
					<a
						href="/search"
						onclick={() => (menuOpen = false)}
						class="block px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
					>
						search
					</a>
					<a
						href="/timeline"
						onclick={() => (menuOpen = false)}
						class="block px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
					>
						timeline
					</a>
					<a
						href="/download"
						download
						data-sveltekit-reload
						onclick={() => (menuOpen = false)}
						class="block px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
					>
						download
					</a>
					<a
						href="https://github.com/patrik64/portfolio-alert"
						target="_blank"
						rel="external noreferrer"
						onclick={() => (menuOpen = false)}
						class="block px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
					>
						github
					</a>
				</div>
			{/if}
		</div>
		<a href="/" class="-mt-1 pl-1 font-semibold">portfolio alert</a>
	</div>

	<main class="flex-1">
		{@render children()}
	</main>

	<footer>
		<Footer />
	</footer>
</div>
