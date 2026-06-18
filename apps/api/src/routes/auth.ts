import { hash, verify } from "@node-rs/argon2";
import { schema } from "@jobpilot/db";
import { loginSchema, registerSchema, type UserDTO } from "@jobpilot/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { hashToken, newSessionToken } from "../lib/crypto.js";
import { loadEnv } from "../lib/env.js";
import { AppError } from "../lib/errors.js";
import { SESSION_COOKIE } from "../plugins/auth.js";

const SESSION_DAYS = 30;

function toUserDTO(u: { id: string; email: string; displayName: string | null; createdAt: Date }): UserDTO {
  return { id: u.id, email: u.email, displayName: u.displayName, createdAt: u.createdAt.toISOString() };
}

export default async function authRoutes(app: FastifyInstance) {
  const env = loadEnv();
  const secure = env.NODE_ENV === "production";

  async function createSession(userId: string): Promise<string> {
    const token = newSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
    await app.db.insert(schema.sessions).values({ userId, tokenHash: hashToken(token), expiresAt });
    return token;
  }

  function setSessionCookie(reply: import("fastify").FastifyReply, token: string) {
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: SESSION_DAYS * 86400,
    });
  }

  app.post("/register", async (req, reply) => {
    const { email, password, displayName } = registerSchema.parse(req.body);
    const existing = await app.db.select().from(schema.users).where(eq(schema.users.email, email));
    if (existing.length) throw new AppError(409, "email_taken", "Email already registered");
    const passwordHash = await hash(password);
    const [user] = await app.db
      .insert(schema.users)
      .values({ email, passwordHash, displayName: displayName ?? null })
      .returning();
    // Create an empty profile so the app has something to edit.
    await app.db.insert(schema.profiles).values({ userId: user!.id }).onConflictDoNothing();
    const token = await createSession(user!.id);
    setSessionCookie(reply, token);
    await app.db.insert(schema.auditLog).values({ userId: user!.id, action: "register", ip: req.ip });
    return reply.status(201).send({ user: toUserDTO(user!) });
  });

  app.post("/login", async (req, reply) => {
    const { email, password } = loginSchema.parse(req.body);
    const [user] = await app.db.select().from(schema.users).where(eq(schema.users.email, email));
    const ok = user?.passwordHash ? await verify(user.passwordHash, password) : false;
    if (!user || !ok) throw new AppError(401, "invalid_credentials", "Invalid email or password");
    const token = await createSession(user.id);
    setSessionCookie(reply, token);
    await app.db.insert(schema.auditLog).values({ userId: user.id, action: "login", ip: req.ip });
    return { user: toUserDTO(user) };
  });

  app.post("/logout", async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) {
      await app.db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, hashToken(token)));
    }
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.status(204).send();
  });

  app.get("/me", async (req) => {
    const user = app.requireUser(req);
    const [row] = await app.db.select().from(schema.users).where(eq(schema.users.id, user.id));
    return { user: toUserDTO(row!) };
  });
}
