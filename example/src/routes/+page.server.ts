import { sleep, traced } from "#lib/server/tracing.js";
import type { PageServerLoad } from "./$types";

type Product = { id: number; name: string; price: number };

const products: Product[] = [
  { id: 1, name: "Keyboard", price: 89 },
  { id: 2, name: "Mouse", price: 39 },
  { id: 3, name: "Monitor", price: 249 },
];

/** A pretend database query with some latency */
function findProducts(): Promise<Product[]> {
  return traced(
    "db.query products",
    { "db.system.name": "sqlite", "db.query.text": "SELECT * FROM products" },
    async (span) => {
      await sleep(20 + Math.random() * 60);
      span.setAttribute("db.response.returned_rows", products.length);
      return products;
    },
  );
}

export const load: PageServerLoad = async ({ fetch }) => {
  const list = await findProducts();

  // an internal request: SvelteKit traces the +server handler under this load span
  const inventory: Record<number, number> = await traced(
    "inventory.lookup",
    { "app.product_count": list.length },
    async () => {
      const res = await fetch(
        `/api/inventory?ids=${list.map((p) => p.id).join(",")}`,
      );
      return res.json();
    },
  );

  const price = await traced(
    "pricing.compute",
    { "app.currency": "EUR" },
    async (span) => {
      await sleep(5 + Math.random() * 15);
      const total = list.reduce(
        (sum, p) => sum + p.price * (inventory[p.id] ?? 0),
        0,
      );
      span.setAttribute("app.stock_value", total);
      span.addEvent("pricing.done", { "app.items": list.length });
      return total;
    },
  );

  return { products: list, inventory, stockValue: price };
};
