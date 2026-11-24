<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<h1>OpenTelemetry example</h1>
<p>Every request to this page produces a trace. Run <code>bun start</code> in the repository root to see them.</p>

<table>
	<thead><tr><th>Product</th><th>Price</th><th>Stock</th></tr></thead>
	<tbody>
		{#each data.products as product (product.id)}
			<tr><td>{product.name}</td><td>€{product.price}</td><td>{data.inventory[product.id]}</td></tr>
		{/each}
	</tbody>
</table>
<p>Stock value: €{data.stockValue}</p>

<p>
	<a href="/" data-sveltekit-reload>Reload</a> ·
	<a href="/boom">A failing page</a>
</p>
