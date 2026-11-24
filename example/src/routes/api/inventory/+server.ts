import { json } from "@sveltejs/kit";
import { sleep, traced } from "#lib/server/tracing.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url }) => {
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .filter(Boolean)
    .map(Number);

  const stock = await traced(
    "cache.get inventory",
    { "app.ids": ids.join(",") },
    async (span) => {
      await sleep(2 + Math.random() * 8);
      const hit = Math.random() < 0.5;
      span.setAttribute("cache.hit", hit);
      if (!hit) {
        await traced("db.query inventory", { "db.system.name": "sqlite" }, () =>
          sleep(30 + Math.random() * 40),
        );
      }
      return Object.fromEntries(
        ids.map((id) => [id, Math.floor(Math.random() * 20)]),
      );
    },
  );

  return json(stock);
};
