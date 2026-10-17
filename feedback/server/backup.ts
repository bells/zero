import { isRecord, isThread, codePoints } from "../shared/contracts.ts";
import { locked, type Database } from "./database.ts";
import { createCore, createModels, type WalineComment } from "./waline.ts";
export async function restoreBackup(
  db: Database,
  secret: string,
  value: unknown,
  ownerId: string,
): Promise<void> {
  if (
    !isRecord(value) ||
    value.type !== "waline" ||
    value.version !== 1 ||
    !isRecord(value.data) ||
    !Array.isArray(value.data.Comment) ||
    !Array.isArray(value.data.Users) ||
    value.data.Comment.length > 100000
  )
    throw new Error("Invalid private backup");
  const rawComments: unknown[] = value.data.Comment;
  const users: unknown[] = value.data.Users;
  const owners = new Set(
    users
      .filter(isRecord)
      .filter((user) => user.type === "administrator")
      .map((user) => user.objectId),
  );
  const comments: WalineComment[] = rawComments.map((row) => {
    if (
      !isRecord(row) ||
      typeof row.objectId !== "string" ||
      typeof row.comment !== "string" ||
      codePoints(row.comment.trim()) < 1 ||
      codePoints(row.comment.trim()) > 2000 ||
      !isThread(row.url) ||
      !["waiting", "approved", "spam", "hidden"].includes(String(row.status)) ||
      !Number.isFinite(Date.parse(String(row.insertedAt))) ||
      (row.mail !== undefined && typeof row.mail !== "string") ||
      (row.nick !== undefined && typeof row.nick !== "string") ||
      (row.pid !== undefined && typeof row.pid !== "string") ||
      (row.rid !== undefined && typeof row.rid !== "string")
    )
      throw new Error("Invalid backup record");
    return {
      objectId: row.objectId,
      comment: row.comment,
      url: row.url,
      insertedAt: String(row.insertedAt),
      status: String(row.status),
      ...(typeof row.mail === "string" ? { mail: row.mail } : {}),
      ...(typeof row.nick === "string" ? { nick: row.nick } : {}),
      ...(typeof row.pid === "string" ? { pid: row.pid } : {}),
      ...(typeof row.rid === "string" ? { rid: row.rid } : {}),
      ...(typeof row.user_id === "string" && owners.has(row.user_id)
        ? { user_id: ownerId }
        : {}),
    };
  });
  const records = new Map(comments.map((row) => [row.objectId, row]));
  if (records.size !== comments.length) throw new Error("Duplicate backup ids");
  for (const row of comments)
    if (row.pid) {
      const parent = records.get(row.pid);
      if (
        !parent ||
        parent.pid ||
        parent.url !== row.url ||
        row.rid !== row.pid ||
        !row.user_id
      )
        throw new Error("Invalid backup relationships");
    }
  await locked(db, async (tx) => {
    const models = createModels(tx);
    const [owner] = await models.Users.select({
      objectId: ownerId,
      type: "administrator",
    });
    if (!owner || (await models.Comment.count()) !== 0)
      throw new Error(
        "Restore requires an initialized isolated empty destination",
      );
    const core = createCore(tx, secret);
    const context = { headers: {}, state: { userInfo: owner } };
    const ids = new Map<string, string>();
    for (const row of comments) {
      const { objectId, pid: _pid, rid: _rid, ...data } = row;
      const restored = await core.database.import(
        { table: "Comment", data },
        context,
      );
      if (typeof restored.objectId !== "string")
        throw new Error("Invalid restored id");
      ids.set(objectId, restored.objectId);
    }
    for (const row of comments)
      if (row.pid)
        await core.database.update(
          {
            table: "Comment",
            objectId: ids.get(row.objectId)!,
            data: { pid: ids.get(row.pid), rid: ids.get(row.pid) },
          },
          context,
        );
  });
}
