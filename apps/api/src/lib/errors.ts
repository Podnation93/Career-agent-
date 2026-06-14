import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

/** Application error with an HTTP status and a stable machine code. */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "Resource") => new AppError(404, "not_found", `${what} not found`);
export const unauthorized = () => new AppError(401, "unauthorized", "Authentication required");
export const forbidden = () => new AppError(403, "forbidden", "Not allowed");
export const badRequest = (msg: string, details?: unknown) =>
  new AppError(400, "bad_request", msg, details);

/** Central error handler — never leaks stack traces or secrets to clients. */
export function errorHandler(
  err: FastifyError | AppError | ZodError,
  req: FastifyRequest,
  reply: FastifyReply,
): void {
  if (err instanceof ZodError) {
    reply.status(400).send({
      error: { code: "validation_error", message: "Invalid request", details: err.flatten() },
    });
    return;
  }
  if (err instanceof AppError) {
    reply.status(err.statusCode).send({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }
  // Fastify validation / rate-limit etc. carry a statusCode.
  const status = (err as FastifyError).statusCode ?? 500;
  if (status >= 500) {
    req.log.error({ err }, "Unhandled error");
    reply.status(500).send({ error: { code: "internal_error", message: "Something went wrong" } });
    return;
  }
  reply.status(status).send({
    error: { code: (err as FastifyError).code ?? "error", message: err.message },
  });
}
