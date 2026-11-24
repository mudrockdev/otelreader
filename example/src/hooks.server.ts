import type { Handle } from "@sveltejs/kit/hooks";

export const handle: Handle = async ({ event, resolve }) => {
  // attributes on the root span show up for the whole request
  event.tracing.root.setAttribute(
    "app.user_agent",
    event.request.headers.get("user-agent") ?? "",
  );
  return resolve(event);
};
