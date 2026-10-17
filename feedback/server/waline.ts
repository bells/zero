import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { PasswordHash } from "phpass";
import { createWalineCore } from "@waline/vercel/node_modules/@waline/core/dist/index.js";
import type {
  WalineModel,
  Where,
  SelectOptions,
  WalineComment,
  WalineUser,
  WalineCounter,
} from "@waline/vercel/node_modules/@waline/core/dist/index.js";
import type { SqlClient } from "./database.ts";
export type { WalineComment, WalineUser };
export function createModels(client: SqlClient) {
  function model<T extends object>(kind: string): WalineModel<T> {
    function condition(where: Where<T>, values: unknown[]): string {
      const add = (value: unknown) => {
        values.push(value instanceof Date ? value.toISOString() : value);
        return `$${values.length}`;
      };
      const parts = Object.entries(where)
        .filter(([key]) => key !== "_logic")
        .map(([key, value]) => {
          if (key === "_complex")
            return `(${condition(value as Where<T>, values)})`;
          const field = `payload ->> ${add(key)}`;
          if (value === undefined || value === null) return `${field} IS NULL`;
          if (!Array.isArray(value)) return `${field} = ${add(String(value))}`;
          const [op, expected] = value;
          if (op === "IN" || op === "NOT IN") {
            if (!Array.isArray(expected) || expected.length === 0)
              return op === "IN" ? "FALSE" : "TRUE";
            return `${field} ${op} (${expected.map((item: unknown) => add(String(item))).join(",")})`;
          }
          if (![">", ">=", "<", "<=", "!=", "LIKE"].includes(String(op)))
            throw new Error("Unsupported model operator");
          return `${field} ${String(op)} ${add(expected instanceof Date ? expected.toISOString() : String(expected))}`;
        });
      return (
        parts.join(
          (where as Record<string, unknown>)._logic === "or" ? " OR " : " AND ",
        ) || "TRUE"
      );
    }
    async function select(
      where: Where<T> = {},
      options: SelectOptions<T> = {},
    ): Promise<T[]> {
      const values: unknown[] = [kind];
      const filter = condition(where, values);
      const orders =
        options.order ??
        (options.desc
          ? [{ field: options.desc, direction: "desc" as const }]
          : []);
      const orderSql = orders.map(({ field, direction, nulls }) => {
        values.push(field);
        return `(payload ->> $${values.length}) ${direction === "asc" ? "ASC" : "DESC"} NULLS ${nulls === "first" ? "FIRST" : "LAST"}`;
      });
      let sql = `SELECT payload FROM feedback_entities WHERE kind=$1 AND (${filter})${orderSql.length ? ` ORDER BY ${orderSql.join(",")}` : ""}`;
      if (options.limit !== undefined) {
        values.push(options.limit);
        sql += ` LIMIT $${values.length}`;
      }
      if (options.offset !== undefined) {
        values.push(options.offset);
        sql += ` OFFSET $${values.length}`;
      }
      const result = await client.query<{ payload: T }>(sql, values);
      return result.rows.map(({ payload }) => payload);
    }
    return {
      select,
      async count(where = {}, options = {}) {
        const values: unknown[] = [kind];
        const filter = condition(where, values);
        if (options.group?.length) {
          const rows = await select(where);
          const grouped = new Map<
            string,
            { count: number; [key: string]: unknown }
          >();
          for (const row of rows) {
            const fields = Object.fromEntries(
              options.group.map((key) => [key, row[key]]),
            );
            const key = JSON.stringify(fields);
            const current = grouped.get(key) ?? { ...fields, count: 0 };
            current.count++;
            grouped.set(key, current);
          }
          return [...grouped.values()];
        }
        const result = await client.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM feedback_entities WHERE kind=$1 AND (${filter})`,
          values,
        );
        return Number(result.rows[0].count);
      },
      async add(data) {
        const row = {
          ...data,
          objectId: randomUUID(),
          createdAt: new Date().toISOString(),
        };
        await client.query(
          "INSERT INTO feedback_entities (kind,id,payload) VALUES ($1,$2,$3::jsonb)",
          [kind, row.objectId, JSON.stringify(row)],
        );
        return row as T;
      },
      async update(data, where) {
        const rows = await select(where);
        return Promise.all(
          rows.map(async (row) => {
            const updated = {
              ...row,
              ...(typeof data === "function" ? data(row) : data),
              updatedAt: new Date().toISOString(),
            };
            await client.query(
              "UPDATE feedback_entities SET payload=$1::jsonb WHERE kind=$2 AND id=$3",
              [
                JSON.stringify(updated),
                kind,
                (row as Record<string, unknown>).objectId,
              ],
            );
            return updated;
          }),
        );
      },
      async delete(where) {
        const values: unknown[] = [kind];
        const filter = condition(where, values);
        await client.query(
          `DELETE FROM feedback_entities WHERE kind=$1 AND (${filter})`,
          values,
        );
      },
    };
  }
  return {
    Comment: model<WalineComment>("Comment"),
    Users: model<WalineUser>("Users"),
    Counter: model<WalineCounter>("Counter"),
    get(name: string) {
      if (!["Comment", "Users", "Counter"].includes(name))
        throw new Error("Unknown model");
      return model<Record<string, unknown>>(name);
    },
  };
}
export function createCore(
  client: SqlClient,
  secret: string,
  now: () => Date = () => new Date(),
) {
  const passwords = new PasswordHash();
  return createWalineCore({
    models: createModels(client),
    config: { audit: true, disableRegion: true, disableUserAgent: true },
    services: {
      clock: { now },
      password: {
        hash: (value) => passwords.hashPasswordAsync(value),
        verify: (value, hash) => passwords.checkPasswordAsync(value, hash),
      },
      token: {
        sign: (id) =>
          jwt.sign({ sub: id }, secret, {
            algorithm: "HS256",
            expiresIn: "30m",
          }),
        verify: (token) => {
          const payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
          if (typeof payload === "string" || !payload.sub)
            throw new Error("Invalid session");
          return payload.sub;
        },
      },
    },
  });
}
