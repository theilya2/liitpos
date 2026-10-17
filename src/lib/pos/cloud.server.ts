import { getSql } from "@/lib/db";
import { isDocKind, type CloudDoc, type DocKind, type Json } from "@/lib/pos/docs";
import { reconcilePush } from "@/lib/pos/merge";

type DocRow = {
  id: string;
  kind: string;
  business_id: string;
  updated_at: string;
  deleted: boolean;
  doc: unknown;
};

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function cleanDoc(input: unknown): CloudDoc | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  if (typeof raw.id !== "string" || raw.id.length > 80) return null;
  if (typeof raw.kind !== "string" || !isDocKind(raw.kind)) return null;
  if (typeof raw.businessId !== "string" || raw.businessId.length > 40) return null;
  if (typeof raw.updatedAt !== "string" || Number.isNaN(Date.parse(raw.updatedAt))) return null;
  const encoded = JSON.stringify(raw.doc ?? {});
  if (encoded.length > 1_500_000) return null;
  return {
    id: raw.id,
    kind: raw.kind,
    businessId: raw.businessId,
    updatedAt: new Date(raw.updatedAt).toISOString(),
    deleted: Boolean(raw.deleted),
    doc: (raw.doc ?? {}) as Json,
  };
}

export function acceptedCloudDocs(input: unknown[]): CloudDoc[] {
  return input.map(cleanDoc).filter((doc): doc is CloudDoc => Boolean(doc));
}

function toCloud(row: DocRow): CloudDoc | null {
  if (!isDocKind(row.kind)) return null;
  return {
    id: row.id,
    kind: row.kind as DocKind,
    businessId: row.business_id,
    updatedAt: row.updated_at,
    deleted: Boolean(row.deleted),
    doc: asObject(row.doc) as Json,
  };
}

export async function pullDocsForUser(userId: string, since: string | null) {
  const sql = await getSql();
  const rows = since
    ? await sql<DocRow>`
        select id, kind, business_id, updated_at::text as updated_at, deleted, doc::text as doc
        from pos_docs
        where user_id = ${userId} and updated_at > ${since}::timestamptz
        order by updated_at asc
        limit 500
      `
    : await sql<DocRow>`
        select id, kind, business_id, updated_at::text as updated_at, deleted, doc::text as doc
        from pos_docs
        where user_id = ${userId}
        order by updated_at asc
        limit 500
      `;
  const clock = await sql<{ now: string }>`select now()::text as now`;
  return {
    docs: rows.map(toCloud).filter((doc): doc is CloudDoc => Boolean(doc)),
    serverTime: clock[0]?.now ?? new Date().toISOString(),
  };
}

export async function pushDocsForUser(userId: string, docs: CloudDoc[]) {
  const sql = await getSql();
  const ids = [
    ...new Set([
      ...docs.map((doc) => doc.id),
      ...docs.map((doc) => doc.businessId).filter(Boolean).map((businessId) => `catalog:${businessId}`),
    ]),
  ];
  const existing = ids.length
    ? (
        await sql.query<DocRow>(
          `select id, kind, business_id, updated_at::text as updated_at, deleted, doc::text as doc
           from pos_docs where user_id = $1 and id in (${ids.map((_, index) => `$${index + 2}`).join(", ")})`,
          [userId, ...ids],
        )
      )
        .map(toCloud)
        .filter((doc): doc is CloudDoc => Boolean(doc))
    : [];
  const result = reconcilePush(existing, docs);
  for (const doc of result.upserts) {
    await sql`
      insert into pos_docs (user_id, id, kind, business_id, updated_at, deleted, doc)
      values (
        ${userId},
        ${doc.id},
        ${doc.kind},
        ${doc.businessId},
        ${doc.updatedAt}::timestamptz,
        ${doc.deleted},
        ${JSON.stringify(doc.doc)}::jsonb
      )
      on conflict (user_id, id) do update set
        kind = excluded.kind,
        business_id = excluded.business_id,
        updated_at = excluded.updated_at,
        deleted = excluded.deleted,
        doc = excluded.doc
    `;
  }
  return { accepted: result.accepted, skipped: result.skipped };
}
