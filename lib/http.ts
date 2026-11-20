import "server-only";
import { ZodError } from "zod";
export function apiError(error: unknown) {
  const message =
    error instanceof ZodError
      ? error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")
      : error instanceof Error
        ? error.message
        : "The operation failed. Please retry.";
  const status = /sign in/i.test(message)
    ? 401
    : /permission|unauthoriz/i.test(message)
      ? 403
      : /changed|stale|recalculate|already active/i.test(message)
        ? 409
        : 400;
  return Response.json({ error: message }, { status });
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = new Set(
    [
      new URL(request.url).origin,
      process.env.APP_URL,
      process.env.NEXT_PUBLIC_APP_URL,
    ].filter(Boolean),
  );
  if (origin && !allowed.has(origin))
    throw new Error("Unauthorized request origin.");
}
