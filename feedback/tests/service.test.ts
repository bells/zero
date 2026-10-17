import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createApp, type FeedbackConfig } from "../server/app.ts";
import {
  initializeDatabase,
  type Database,
  type SqlClient,
} from "../server/database.ts";
const origin = "http://127.0.0.1:4323";
async function fixture() {
  const pg = new PGlite();
  await pg.waitReady;
  const db: Database = {
    query: (sql, values) => pg.query(sql, values),
    transaction: (work) => pg.transaction((tx) => work(tx as SqlClient)),
  };
  await initializeDatabase(db);
  const config: FeedbackConfig = {
    origin,
    parents: ["http://127.0.0.1:4321"],
    jwtSecret: "synthetic-only-jwt-secret-at-least-32-characters",
    sourceSalt: "synthetic-only-rate-limit-salt",
    dailyBudget: 100,
    writesPaused: false,
  };
  const app = createApp(db, config);
  let index = 0;
  const request = async (
    path: string,
    method = "GET",
    body?: unknown,
    token?: string,
    source = "synthetic-source",
  ) =>
    app.request(
      `${origin}${path}`,
      {
        method,
        headers: {
          Origin: origin,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      { sourceAddress: source },
    );
  const submit = (patch: Record<string, unknown> = {}, source?: string) =>
    request(
      "/api/feedback",
      "POST",
      {
        threadId: "tools/json",
        content: `Suggestion ${index}`,
        idempotencyKey: `synthetic-attempt-${String(index++).padStart(8, "0")}`,
        ...patch,
      },
      undefined,
      source,
    );
  return { pg, db, config, app, request, submit };
}
test("anonymous HTTP submission is persisted as pending with literal text; public reads and native routes protect it", async () => {
  const f = await fixture();
  try {
    const response = await f.submit({
      content:
        '<img src="https://example.invalid/x">\n![x](https://example.invalid) 😀',
      email: "contact@example.invalid",
    });
    assert.equal(response.status, 202);
    assert.deepEqual(Object.keys(await response.json()).sort(), [
      "receiptId",
      "status",
    ]);
    const page = await (
      await f.request("/api/feedback?threadId=tools/json")
    ).json();
    assert.deepEqual(page, { items: [], nextCursor: null });
    const rows = await f.db.query(
      "SELECT payload FROM feedback_entities WHERE kind=$1",
      ["Comment"],
    );
    assert.equal(rows.rows.length, 1);
    const payload = rows.rows[0].payload as Record<string, unknown>;
    assert.equal(payload.status, "waiting");
    assert.equal(payload.mail, "contact@example.invalid");
    assert.equal("ip" in payload, false);
    assert.equal("ua" in payload, false);
    for (const base of [
      "",
      "/api",
      "/.netlify/functions/waline",
      "/.netlify/functions/waline/api",
    ])
      for (const path of [
        "/comment",
        "/comment/1",
        "/comment/rss",
        "/user",
        "/user/1",
        "/db",
        "/token",
        "/article",
        "/oauth",
        "/verification",
        "/user/password",
        "/token/2fa",
      ])
        for (const method of ["GET", "POST", "PUT", "DELETE"]) {
          const denied = await f.request(
            `${base}${path}?method=post`,
            method,
            method === "GET" ? undefined : {},
          );
          assert.equal(denied.status, 404, `${method} ${base}${path}`);
        }
  } finally {
    await f.pg.close();
  }
});
test("HTTP validation, strict body bound and unknown fields apply before writes", async () => {
  const f = await fixture();
  try {
    for (const patch of [
      { threadId: "/en/tools/json" },
      { parentId: "x" },
      { role: "owner" },
      { status: "approved" },
      { nickname: "😀".repeat(41) },
      { content: "😀".repeat(2001) },
      { content: "" },
      { email: "bad" },
    ])
      assert.equal((await f.submit(patch)).status, 400);
    assert.equal((await f.submit({ content: "x".repeat(17000) })).status, 413);
    assert.equal(
      (await f.db.query("SELECT * FROM feedback_entities")).rows.length,
      0,
    );
  } finally {
    await f.pg.close();
  }
});
test("shared limits, spoofed forwarding headers, idempotency, pause and global budget", async () => {
  const f = await fixture();
  try {
    const attempt = {
      content: "Only once",
      idempotencyKey: "idempotency-test-key-0001",
    };
    const first = await f.submit(attempt);
    assert.equal(first.status, 202);
    const receipt = await first.json();
    assert.deepEqual(await (await f.submit(attempt)).json(), receipt);
    assert.equal(
      (await f.submit({ ...attempt, content: "Changed" })).status,
      409,
    );
    const otherInstance = createApp(f.db, f.config);
    const replies = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        otherInstance.request(
          `${origin}/api/feedback`,
          {
            method: "POST",
            headers: {
              Origin: origin,
              "Content-Type": "application/json",
              "X-Forwarded-For": `198.51.100.${i}`,
            },
            body: JSON.stringify({
              threadId: "tools",
              content: `Concurrent ${i}`,
              idempotencyKey: `concurrent-attempt-key-${i}`,
            }),
          },
          { sourceAddress: "same-trusted-source" },
        ),
      ),
    );
    assert.equal(replies.filter((r) => r.status === 202).length, 5);
    assert.equal(replies.filter((r) => r.status === 429).length, 1);
    f.config.writesPaused = true;
    assert.equal((await f.submit({}, "new-source")).status, 503);
    f.config.writesPaused = false;
    f.config.dailyBudget = 1;
    assert.equal((await f.submit({}, "new-source")).status, 503);
  } finally {
    await f.pg.close();
  }
});

test("authenticated Waline owner reviews, replies, hides, deletes and exports without native registration", async () => {
  const f = await fixture();
  try {
    const { createCore } = await import("../server/waline.ts");
    await createCore(f.db, f.config.jwtSecret).user.register(
      {
        email: "owner@example.invalid",
        password: "synthetic-private-password",
      },
      { headers: {}, state: {} },
    );
    const login = await f.request("/api/admin/login", "POST", {
      email: "owner@example.invalid",
      password: "synthetic-private-password",
    });
    assert.equal(login.status, 200);
    const { token } = (await login.json()) as { token: string };
    assert.ok(token);
    await f.submit({
      content: "<b>literal</b>",
      email: "private@example.invalid",
      nickname: "Owner",
    });
    const listing = (await (
      await f.request("/api/admin/feedback", "GET", undefined, token)
    ).json()) as { items: { objectId: string }[] };
    const id = listing.items[0].objectId;
    assert.equal(
      (await f.request(`/api/feedback/${id}?threadId=tools/json`)).status,
      404,
    );
    assert.equal(
      (
        await f.request(`/api/admin/feedback/${id}`, "PATCH", {
          status: "approved",
        })
      ).status,
      401,
    );
    assert.equal((await f.request("/api/admin/export")).status, 401);
    assert.equal(
      (
        await f.request(
          `/api/admin/feedback/${id}`,
          "PATCH",
          { status: "approved" },
          token,
        )
      ).status,
      200,
    );
    const reply = await f.request(
      "/api/admin/replies",
      "POST",
      { threadId: "tools/json", parentId: id, content: "Owner response" },
      token,
    );
    assert.equal(reply.status, 201);
    const replyBody = (await reply.json()) as { id: string };
    assert.equal(
      (
        await f.request(
          "/api/admin/replies",
          "POST",
          { threadId: "tools/diff", parentId: id, content: "wrong thread" },
          token,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await f.request(
          "/api/admin/replies",
          "POST",
          { threadId: "tools/json", parentId: replyBody.id, content: "nested" },
          token,
        )
      ).status,
      400,
    );
    const publicPage = await (
      await f.request("/api/feedback?threadId=tools/json")
    ).json();
    assert.equal(
      JSON.stringify(publicPage).includes("private@example.invalid"),
      false,
    );
    const replies = await (
      await f.request(`/api/feedback?threadId=tools/json&parentId=${id}`)
    ).json();
    assert.equal(replies.items[0].authorRole, "owner");
    assert.equal(publicPage.items[0].authorRole, "visitor");
    const exported = await f.request(
      "/api/admin/export",
      "GET",
      undefined,
      token,
    );
    assert.equal(exported.status, 200);
    assert.ok(
      JSON.stringify(await exported.json()).includes("private@example.invalid"),
    );
    const forged = await f.app.request(`${origin}/api/admin/feedback/${id}`, {
      method: "PATCH",
      headers: {
        Origin: "https://attacker.example.invalid",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "approved" }),
    });
    assert.equal(forged.status, 403);
    await f.request(
      `/api/admin/feedback/${id}`,
      "PATCH",
      { status: "hidden" },
      token,
    );
    assert.equal(
      (await f.request(`/api/feedback?threadId=tools/json&parentId=${id}`))
        .status,
      404,
    );
    assert.equal(
      (await f.request(`/api/feedback/${replyBody.id}?threadId=tools/json`))
        .status,
      404,
    );
    assert.equal(
      (await f.request(`/api/admin/feedback/${id}`, "DELETE", undefined, token))
        .status,
      200,
    );
  } finally {
    await f.pg.close();
  }
});

test("five-in-ten-minutes is a sliding limit across clock boundaries and expiry is purged", async () => {
  const f = await fixture();
  try {
    let time = Date.UTC(2026, 9, 17, 0, 9, 59);
    f.config.now = () => new Date(time);
    for (let i = 0; i < 5; i++) assert.equal((await f.submit()).status, 202);
    time += 2000;
    assert.equal((await f.submit()).status, 429);
    time += 600000;
    assert.equal((await f.submit()).status, 202);
    const limits = await f.db.query<{ expires: string }>(
      "SELECT expires FROM feedback_limits",
    );
    assert.equal(limits.rows.length, 1);
    assert.ok(Number(limits.rows[0].expires) <= time + 86400000);
  } finally {
    await f.pg.close();
  }
});

test("private JSON export and isolated restore preserve contacts, review states, thread and reply relationships", async () => {
  const source = await fixture();
  const target = await fixture();
  try {
    const { createCore, createModels } = await import("../server/waline.ts");
    const { restoreBackup } = await import("../server/backup.ts");
    await createCore(source.db, source.config.jwtSecret).user.register(
      {
        email: "source-owner@example.invalid",
        password: "synthetic-password-00001",
      },
      { headers: {}, state: {} },
    );
    await createCore(target.db, target.config.jwtSecret).user.register(
      {
        email: "target-owner@example.invalid",
        password: "synthetic-password-00002",
      },
      { headers: {}, state: {} },
    );
    const [owner] = await createModels(source.db).Users.select({
      type: "administrator",
    });
    const [destination] = await createModels(target.db).Users.select({
      type: "administrator",
    });
    const core = createCore(source.db, source.config.jwtSecret);
    const pending = await core.comment.create(
      {
        url: "tools",
        comment: "Waiting",
        mail: "private-restore@example.invalid",
      },
      { headers: {}, state: {} },
    );
    const root = await core.comment.create(
      { url: "tools/json", comment: "Public source" },
      { headers: {}, state: { userInfo: owner } },
    );
    await core.comment.create(
      {
        url: "tools/json",
        comment: "Owner child",
        pid: root.objectId,
        rid: root.objectId,
      },
      { headers: {}, state: { userInfo: owner } },
    );
    await core.comment.update(
      { objectId: pending.objectId!, data: { status: "spam" } },
      { headers: {}, state: { userInfo: owner } },
    );
    await core.comment.create(
      {
        url: "tools/diff",
        comment: "Still waiting",
        mail: "pending-private@example.invalid",
      },
      { headers: {}, state: {} },
    );
    const hidden = await core.comment.create(
      { url: "tools/json", comment: "Hidden source" },
      { headers: {}, state: { userInfo: owner } },
    );
    await core.comment.create(
      {
        url: "tools/json",
        comment: "Hidden child",
        pid: hidden.objectId,
        rid: hidden.objectId,
      },
      { headers: {}, state: { userInfo: owner } },
    );
    await core.comment.update(
      { objectId: hidden.objectId!, data: { status: "hidden" } },
      { headers: {}, state: { userInfo: owner } },
    );
    const backup = await core.database.export(
      {},
      { headers: {}, state: { userInfo: owner } },
    );
    await restoreBackup(
      target.db,
      target.config.jwtSecret,
      backup,
      destination.objectId,
    );
    const restored = await createModels(target.db).Comment.select({});
    assert.equal(restored.length, 6);
    assert.ok(restored.some((row) => row.status === "waiting"));
    assert.ok(restored.some((row) => row.status === "hidden"));
    assert.ok(
      restored.some(
        (row) =>
          row.mail === "private-restore@example.invalid" &&
          row.status === "spam",
      ),
    );
    const publicList = await (
      await target.request("/api/feedback?threadId=tools/json")
    ).json();
    assert.equal(publicList.items.length, 1);
    assert.equal(publicList.items[0].content, "Public source");
    const replies = await (
      await target.request(
        `/api/feedback?threadId=tools/json&parentId=${publicList.items[0].id}`,
      )
    ).json();
    assert.equal(replies.items[0].content, "Owner child");
    assert.equal(replies.items[0].authorRole, "owner");
    await assert.rejects(
      restoreBackup(
        target.db,
        target.config.jwtSecret,
        backup,
        destination.objectId,
      ),
    );
  } finally {
    await source.pg.close();
    await target.pg.close();
  }
});

test("valid rejected duplicate attempts and administrator login guesses are still rate limited", async () => {
  const f = await fixture();
  try {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++)
      statuses.push(
        (
          await f.submit(
            { content: "Repeated duplicate text" },
            "duplicate-source",
          )
        ).status,
      );
    assert.deepEqual(statuses, [202, 400, 400, 400, 400, 429, 429]);
    const guesses: number[] = [];
    for (let i = 0; i < 6; i++)
      guesses.push(
        (
          await f.request(
            "/api/admin/login",
            "POST",
            {
              email: "unknown@example.invalid",
              password: "synthetic-wrong-password",
            },
            undefined,
            "login-source",
          )
        ).status,
      );
    assert.deepEqual(guesses, [401, 401, 401, 401, 401, 429]);
  } finally {
    await f.pg.close();
  }
});

test("public pagination, counts, direct IDs and reply pages expose only approved allowlisted fields", async () => {
  const f = await fixture();
  try {
    const { createCore, createModels } = await import("../server/waline.ts");
    await createCore(f.db, f.config.jwtSecret).user.register(
      {
        email: "pagination-owner@example.invalid",
        password: "synthetic-pagination-password",
      },
      { headers: {}, state: {} },
    );
    const [owner] = await createModels(f.db).Users.select({
      type: "administrator",
    });
    const seed = async (id: string, patch: Record<string, unknown> = {}) => {
      await f.db.query(
        "INSERT INTO feedback_entities (kind,id,payload) VALUES ('Comment',$1,$2::jsonb)",
        [
          id,
          JSON.stringify({
            objectId: id,
            url: "tools/json",
            status: "approved",
            comment: `Synthetic ${id}`,
            insertedAt: new Date(
              Date.UTC(2026, 9, 17, 0, 0, Number(id.slice(-2)) || 0),
            ).toISOString(),
            mail: "PRIVATE-PAGINATION@example.invalid",
            mailMd5: "PRIVATE-HASH",
            ip: "PRIVATE-IP",
            ua: "PRIVATE-UA",
            ...patch,
          }),
        ],
      );
    };
    for (let i = 0; i < 25; i++)
      await seed(`root-${String(i).padStart(2, "0")}`);
    for (const status of ["waiting", "spam", "hidden"])
      await seed(`private-${status}`, { status, comment: "PRIVATE-BODY" });
    await seed("other-thread", { url: "tools/diff" });
    for (let i = 0; i < 25; i++)
      await seed(`reply-${String(i).padStart(2, "0")}`, {
        pid: "root-24",
        rid: "root-24",
        user_id: owner.objectId,
      });
    const first = await (
      await f.request("/api/feedback?threadId=tools/json")
    ).json();
    const second = await (
      await f.request(
        `/api/feedback?threadId=tools/json&cursor=${first.nextCursor}`,
      )
    ).json();
    assert.equal(first.items.length, 20);
    assert.equal(second.items.length, 5);
    assert.equal(second.nextCursor, null);
    assert.equal(first.items[0].id, "root-24");
    assert.equal(
      new Set(
        [...first.items, ...second.items].map(
          (item: { id: string }) => item.id,
        ),
      ).size,
      25,
    );
    assert.deepEqual(
      await (await f.request("/api/count?threadId=tools/json")).json(),
      { count: 25 },
    );
    for (const status of ["waiting", "spam", "hidden"])
      assert.equal(
        (await f.request(`/api/feedback/private-${status}?threadId=tools/json`))
          .status,
        404,
      );
    assert.equal(
      (await f.request("/api/feedback/other-thread?threadId=tools/json"))
        .status,
      404,
    );
    const replies = await (
      await f.request("/api/feedback?threadId=tools/json&parentId=root-24")
    ).json();
    const moreReplies = await (
      await f.request(
        `/api/feedback?threadId=tools/json&parentId=root-24&cursor=${replies.nextCursor}`,
      )
    ).json();
    assert.equal(replies.items.length, 20);
    assert.equal(moreReplies.items.length, 5);
    const direct = await (
      await f.request("/api/feedback/reply-24?threadId=tools/json")
    ).json();
    for (const item of [
      ...first.items,
      ...second.items,
      ...replies.items,
      ...moreReplies.items,
      direct,
    ]) {
      assert.deepEqual(
        Object.keys(item).sort(),
        [
          "id",
          "threadId",
          "content",
          "displayName",
          "createdAt",
          "authorRole",
          ...(item.parentId ? ["parentId"] : []),
        ].sort(),
      );
      assert.doesNotMatch(JSON.stringify(item), /PRIVATE-/);
    }
    await f.db.query("DELETE FROM feedback_entities WHERE id='root-24'");
    assert.equal(
      (await f.request("/api/feedback/reply-24?threadId=tools/json")).status,
      404,
    );
    assert.equal(
      (await f.request("/api/feedback?threadId=tools/json&parentId=root-24"))
        .status,
      404,
    );
  } finally {
    await f.pg.close();
  }
});
