import { createHmac, randomUUID } from "node:crypto";
import { Hono } from "hono";
import {
  isRecord,
  isThread,
  parseCreate,
  codePoints,
  type ErrorCode,
  type PublicFeedback,
} from "../shared/contracts.ts";
import { locked, purgeExpired, type Database } from "./database.ts";
import { WalineError } from "@waline/vercel/node_modules/@waline/core/dist/index.js";
import {
  createCore,
  createModels,
  type WalineComment,
  type WalineUser,
} from "./waline.ts";
export interface FeedbackConfig {
  origin: string;
  parents: string[];
  jwtSecret: string;
  sourceSalt: string;
  dailyBudget: number;
  writesPaused: boolean;
  now?: () => Date;
}
class SafeError extends Error {
  readonly code: ErrorCode;
  readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 503;
  readonly retryAfterSeconds?: number;
  constructor(
    code: ErrorCode,
    status: SafeError["status"],
    retryAfterSeconds?: number,
  ) {
    super(code);
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
async function body(request: Request): Promise<unknown> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new SafeError("invalid_input", 400);
  const reader = request.body?.getReader();
  if (!reader) throw new SafeError("invalid_input", 400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 16384) {
        await reader.cancel();
        throw new SafeError("invalid_input", 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch (error) {
    if (error instanceof SafeError) throw error;
    throw new SafeError("invalid_input", 400);
  }
}
function publicItem(row: WalineComment, ownerIds: Set<string>): PublicFeedback {
  if (!isThread(row.url)) throw new SafeError("unavailable", 503);
  return {
    id: row.objectId,
    threadId: row.url,
    content: row.comment,
    displayName: row.nick ?? "",
    createdAt: new Date(row.insertedAt).toISOString(),
    authorRole: row.user_id && ownerIds.has(row.user_id) ? "owner" : "visitor",
    ...(row.pid ? { parentId: row.pid } : {}),
  };
}
export function createApp(db: Database, config: FeedbackConfig) {
  const app = new Hono<{
    Bindings: { sourceAddress?: string };
    Variables: { owner: WalineUser };
  }>();
  const now = () => config.now?.() ?? new Date();
  const digest = (text: string) =>
    createHmac("sha256", config.sourceSalt).update(text).digest("hex");
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Content-Type-Options", "nosniff");
    c.header(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), clipboard-read=(), clipboard-write=()",
    );
    c.header(
      "Content-Security-Policy",
      `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors ${c.req.path.startsWith("/admin") ? "'none'" : config.parents.join(" ") || "'none'"}`,
    );
    if (
      c.req.method !== "GET" &&
      c.req.method !== "HEAD" &&
      c.req.header("Origin") !== config.origin
    )
      throw new SafeError("forbidden", 403);
    await next();
  });
  app.onError((error, c) => {
    const safe =
      error instanceof SafeError ? error : new SafeError("unavailable", 503);
    if (safe.retryAfterSeconds)
      c.header("Retry-After", String(safe.retryAfterSeconds));
    return c.json(
      {
        code: safe.code,
        ...(safe.retryAfterSeconds
          ? { retryAfterSeconds: safe.retryAfterSeconds }
          : {}),
      },
      safe.status,
    );
  });
  app.notFound((c) => c.json({ code: "not_found" }, 404));
  app.post("/api/feedback", async (c) => {
    const value = parseCreate(await body(c.req.raw));
    if (!value || new URL(c.req.url).search)
      throw new SafeError("invalid_input", 400);
    const source = c.env?.sourceAddress;
    if (
      !source ||
      config.writesPaused ||
      !Number.isInteger(config.dailyBudget) ||
      config.dailyBudget < 1
    )
      throw new SafeError("unavailable", 503);
    const result = await locked(db, async (tx) => {
      const time = now().getTime();
      await purgeExpired(tx, time);
      const attempt = digest(`attempt:${value.idempotencyKey}`);
      const fingerprint = digest(
        JSON.stringify([
          value.threadId,
          value.content,
          value.nickname,
          value.email,
        ]),
      );
      const prior = await tx.query<{ fingerprint: string; receipt: string }>(
        "SELECT fingerprint,receipt FROM feedback_attempts WHERE digest=$1",
        [attempt],
      );
      if (prior.rows.length) {
        if (prior.rows[0].fingerprint !== fingerprint)
          throw new SafeError("conflict", 409);
        return {
          receiptId: prior.rows[0].receipt,
          status: "awaiting_moderation" as const,
        };
      }
      const sourceDigest = digest(`source:${source}`);
      const limit = await tx.query<{ attempts: string; expires: string }>(
        "SELECT COUNT(*) AS attempts, MIN(expires) AS expires FROM feedback_limits WHERE digest=$1 AND expires>$2",
        [sourceDigest, time],
      );
      if (Number(limit.rows[0]?.attempts ?? 0) >= 5)
        throw new SafeError(
          "rate_limited",
          429,
          Math.max(1, Math.ceil((Number(limit.rows[0].expires) - time) / 1000)),
        );
      const day = new Date(time).toISOString().slice(0, 10);
      const budget = await tx.query<{ writes: number }>(
        "SELECT writes FROM feedback_budget WHERE day=$1",
        [day],
      );
      if (Number(budget.rows[0]?.writes ?? 0) >= config.dailyBudget)
        throw new SafeError("unavailable", 503);
      await tx.query(
        "INSERT INTO feedback_limits (id,digest,expires) VALUES ($1,$2,$3)",
        [randomUUID(), sourceDigest, time + 600000],
      );
      await tx.query("SAVEPOINT feedback_create");
      try {
        await createCore(tx, config.jwtSecret, now).comment.create(
          {
            url: value.threadId,
            comment: value.content,
            nick: value.nickname,
            mail: value.email,
          },
          { headers: {}, state: {} },
        );
      } catch (error) {
        await tx.query("ROLLBACK TO SAVEPOINT feedback_create");
        return {
          failure: new SafeError(
            error instanceof WalineError ? "invalid_input" : "unavailable",
            error instanceof WalineError ? 400 : 503,
          ),
        };
      }
      await tx.query("RELEASE SAVEPOINT feedback_create");
      await tx.query(
        "INSERT INTO feedback_budget (day,writes) VALUES ($1,1) ON CONFLICT (day) DO UPDATE SET writes=feedback_budget.writes+1",
        [day],
      );
      const receipt = randomUUID();
      await tx.query(
        "INSERT INTO feedback_attempts (digest,fingerprint,receipt,expires) VALUES ($1,$2,$3,$4)",
        [attempt, fingerprint, receipt, time + 86400000],
      );
      return { receiptId: receipt, status: "awaiting_moderation" as const };
    });
    if ("failure" in result) throw result.failure;
    return c.json(result, 202);
  });
  app.get("/api/feedback", async (c) => {
    const { threadId, parentId, cursor } = c.req.query();
    if (
      !isThread(threadId) ||
      Object.keys(c.req.query()).some(
        (key) => !["threadId", "parentId", "cursor"].includes(key),
      ) ||
      (cursor && !/^\d{1,8}$/.test(cursor))
    )
      throw new SafeError("invalid_input", 400);
    const models = createModels(db);
    if (parentId) {
      const [parent] = await models.Comment.select({
        objectId: parentId,
        url: threadId,
        status: "approved",
        pid: undefined,
      });
      if (!parent) throw new SafeError("not_found", 404);
    }
    const rows = await models.Comment.select(
      { url: threadId, status: "approved", pid: parentId || undefined },
      {
        order: [
          { field: "insertedAt", direction: "desc" },
          { field: "objectId", direction: "desc" },
        ],
        limit: 21,
        offset: Number(cursor || 0),
      },
    );
    const owners = await models.Users.select({ type: "administrator" });
    const ownerIds = new Set(owners.map((user) => user.objectId));
    const items = rows
      .slice(0, 20)
      .filter((row) => !parentId || (row.user_id && ownerIds.has(row.user_id)))
      .map((row) => publicItem(row, ownerIds));
    return c.json({
      items,
      nextCursor: rows.length > 20 ? String(Number(cursor || 0) + 20) : null,
    });
  });
  app.get("/api/feedback/:id", async (c) => {
    const threadId = c.req.query("threadId");
    if (!isThread(threadId)) throw new SafeError("invalid_input", 400);
    const models = createModels(db);
    const [row] = await models.Comment.select({
      objectId: c.req.param("id"),
      url: threadId,
      status: "approved",
    });
    if (
      !row ||
      (row.pid &&
        !(
          await models.Comment.select({
            objectId: row.pid,
            url: threadId,
            status: "approved",
            pid: undefined,
          })
        ).length)
    )
      throw new SafeError("not_found", 404);
    const ids = new Set(
      (await models.Users.select({ type: "administrator" })).map(
        (user) => user.objectId,
      ),
    );
    if (row.pid && (!row.user_id || !ids.has(row.user_id)))
      throw new SafeError("not_found", 404);
    return c.json(publicItem(row, ids));
  });
  app.use("/api/admin/*", async (c, next) => {
    if (c.req.path === "/api/admin/login") return next();
    const authorization = c.req.header("Authorization");
    if (!authorization?.startsWith("Bearer ") || authorization.length > 4096)
      throw new SafeError("unauthorized", 401);
    const session = await createCore(
      db,
      config.jwtSecret,
      now,
    ).auth.resolveSession(
      { token: authorization.slice(7) },
      { headers: {}, state: {} },
    );
    if (!session) throw new SafeError("unauthorized", 401);
    if (session.type !== "administrator") throw new SafeError("forbidden", 403);
    c.set("owner", session);
    await next();
  });
  app.post("/api/admin/login", async (c) => {
    const input = await body(c.req.raw);
    if (
      !isRecord(input) ||
      Object.keys(input).some(
        (key) => !["email", "password", "code"].includes(key),
      ) ||
      typeof input.email !== "string" ||
      typeof input.password !== "string" ||
      input.password.length > 512 ||
      input.email.length > 254 ||
      (input.code !== undefined && typeof input.code !== "string")
    )
      throw new SafeError("invalid_input", 400);
    const source = c.env?.sourceAddress;
    if (!source) throw new SafeError("unavailable", 503);
    await locked(db, async (tx) => {
      const time = now().getTime();
      await purgeExpired(tx, time);
      const sourceDigest = digest(`login:${source}`);
      const limits = await tx.query<{ attempts: string; expires: string }>(
        "SELECT COUNT(*) AS attempts,MIN(expires) AS expires FROM feedback_limits WHERE digest=$1 AND expires>$2",
        [sourceDigest, time],
      );
      if (Number(limits.rows[0]?.attempts ?? 0) >= 5)
        throw new SafeError(
          "rate_limited",
          429,
          Math.max(
            1,
            Math.ceil((Number(limits.rows[0].expires) - time) / 1000),
          ),
        );
      const day = new Date(time).toISOString().slice(0, 10) + ":login";
      const budget = await tx.query<{ writes: number }>(
        "SELECT writes FROM feedback_budget WHERE day=$1",
        [day],
      );
      if (
        Number(budget.rows[0]?.writes ?? 0) >= Math.max(20, config.dailyBudget)
      )
        throw new SafeError("unavailable", 503);
      await tx.query(
        "INSERT INTO feedback_limits (id,digest,expires) VALUES ($1,$2,$3)",
        [randomUUID(), sourceDigest, time + 600000],
      );
      await tx.query(
        "INSERT INTO feedback_budget (day,writes) VALUES ($1,1) ON CONFLICT (day) DO UPDATE SET writes=feedback_budget.writes+1",
        [day],
      );
    });
    try {
      const session = await createCore(db, config.jwtSecret, now).auth.login(
        {
          email: input.email,
          password: input.password,
          ...(typeof input.code === "string" ? { code: input.code } : {}),
        },
        { headers: {}, state: {} },
      );
      if (session.type !== "administrator")
        throw new SafeError("forbidden", 403);
      return c.json({ token: session.token, expiresIn: 1800 });
    } catch {
      throw new SafeError("unauthorized", 401);
    }
  });
  app.get("/api/admin/feedback", async (c) => {
    const page = Number(c.req.query("page") || 1);
    const status = c.req.query("status");
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 100000 ||
      (status && !["waiting", "approved", "spam", "hidden"].includes(status))
    )
      throw new SafeError("invalid_input", 400);
    const result = await createCore(
      db,
      config.jwtSecret,
      now,
    ).comment.listForAdmin(
      { page, pageSize: 20, ...(status ? { status } : {}) },
      { headers: {}, state: { userInfo: c.get("owner") } },
    );
    return c.json({
      items: result.data,
      page: result.page,
      totalPages: result.totalPages,
    });
  });
  app.patch("/api/admin/feedback/:id", async (c) => {
    const input = await body(c.req.raw);
    if (
      !isRecord(input) ||
      !Object.keys(input).length ||
      Object.keys(input).some((key) => !["content", "status"].includes(key)) ||
      (input.content !== undefined &&
        (typeof input.content !== "string" ||
          codePoints(input.content.trim()) < 1 ||
          codePoints(input.content.trim()) > 2000)) ||
      (input.status !== undefined &&
        !["waiting", "approved", "spam", "hidden"].includes(
          String(input.status),
        ))
    )
      throw new SafeError("invalid_input", 400);
    const result = await locked(db, (tx) =>
      createCore(tx, config.jwtSecret, now).comment.update(
        {
          objectId: c.req.param("id"),
          data: {
            ...(typeof input.content === "string"
              ? { comment: input.content.trim() }
              : {}),
            ...(typeof input.status === "string"
              ? { status: input.status }
              : {}),
          },
        },
        { headers: {}, state: { userInfo: c.get("owner") } },
      ),
    );
    if (!result) throw new SafeError("not_found", 404);
    return c.json({ updated: true });
  });
  app.delete("/api/admin/feedback/:id", async (c) => {
    await locked(db, (tx) =>
      createCore(tx, config.jwtSecret, now).comment.remove(
        { objectId: c.req.param("id") },
        { headers: {}, state: { userInfo: c.get("owner") } },
      ),
    );
    return c.json({ deleted: true });
  });
  app.post("/api/admin/replies", async (c) => {
    const input = await body(c.req.raw);
    if (
      !isRecord(input) ||
      Object.keys(input).some(
        (key) => !["threadId", "parentId", "content"].includes(key),
      ) ||
      !isThread(input.threadId) ||
      typeof input.parentId !== "string" ||
      typeof input.content !== "string" ||
      codePoints(input.content.trim()) < 1 ||
      codePoints(input.content.trim()) > 2000
    )
      throw new SafeError("invalid_input", 400);
    const { threadId, parentId, content } = input;
    const row = await locked(db, async (tx) => {
      const [parent] = await createModels(tx).Comment.select({
        objectId: parentId,
        url: threadId,
        status: "approved",
        pid: undefined,
      });
      if (!parent) throw new SafeError("invalid_input", 400);
      return createCore(tx, config.jwtSecret, now).comment.create(
        {
          comment: content.trim(),
          url: threadId,
          pid: parentId,
          rid: parentId,
          nick: c.get("owner").display_name ?? "",
        },
        { headers: {}, state: { userInfo: c.get("owner") } },
      );
    });
    return c.json({ id: row.objectId }, 201);
  });
  app.get("/api/admin/export", async (c) => {
    const exported = await locked(db, (tx) =>
      createCore(tx, config.jwtSecret, now).database.export(
        {},
        { headers: {}, state: { userInfo: c.get("owner") } },
      ),
    );
    c.header(
      "Content-Disposition",
      'attachment; filename="zero-feedback-private.json"',
    );
    return c.json(exported);
  });
  app.get("/api/count", async (c) => {
    const threadId = c.req.query("threadId");
    if (!isThread(threadId)) throw new SafeError("invalid_input", 400);
    return c.json({
      count: await createModels(db).Comment.count({
        url: threadId,
        status: "approved",
        pid: undefined,
      }),
    });
  });
  return app;
}
