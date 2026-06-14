import type { Database } from "@jobpilot/db";

export interface AuthedUser {
  id: string;
  email: string;
  displayName: string | null;
}

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
    /** Throws 401 if there is no authenticated user; otherwise returns it. */
    requireUser(req: import("fastify").FastifyRequest): AuthedUser;
  }
  interface FastifyRequest {
    user?: AuthedUser;
  }
}
