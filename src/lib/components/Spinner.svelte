<script lang="ts">
	let { label = 'loading' }: { label?: string } = $props();
</script>

<div class="mt-10 flex justify-center" role="status" aria-label={label}>
	<div class="h-8 w-8 animate-spin rounded-full border-4 border-primary-400 border-t-primary-700"></div>
</div>
