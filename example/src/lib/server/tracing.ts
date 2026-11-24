import {
  SpanStatusCode,
  trace,
  type Attributes,
  type Span,
} from "@opentelemetry/api";

export const tracer = trace.getTracer("example-sveltekit");

/**
 * Runs `fn` inside a new span that is a child of the current one (e.g. the
 * `sveltekit.load` span), recording errors and ending the span when done.
 */
export function traced<T>(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<T> | T,
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn(span);
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      throw error;
    } finally {
      span.end();
    }
  });
}

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
