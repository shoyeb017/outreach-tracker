import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const ACCOUNT_BUCKETS = ["imports", "signature-assets"] as const;
const userUuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
export function safeAccountPath(userId: string, path: string) {
  return userUuid.test(userId) && path.startsWith(`${userId}/`) &&
    path.split("/").every((part) => !!part && part !== "." && part !== ".." && !part.includes("\\"));
}

// Always read page zero after removing files: advancing an offset would skip
// files when the collection shrinks. Empty virtual folders disappear in Storage.
export async function removeAccountFiles(db: SupabaseClient, userId: string, deadline: number) {
  if (!userUuid.test(userId)) throw new Error("A valid account ID is required before cleaning uploaded files.");
  let requests = 0;
  async function clear(bucket: string, prefix: string, depth = 0): Promise<void> {
    if (depth > 12) throw new Error("Storage folders are too deeply nested. Ask support to finish account cleanup.");
    while (true) {
      if (++requests > 400 || Date.now() > deadline) throw new Error("Cleanup needs another pass. Retry deletion to continue; the account remains locked.");
      const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 100, offset: 0, sortBy: { column: "name", order: "asc" } });
      if (error || !data) throw new Error("Uploaded files could not be listed. Check Storage access, then retry deletion.");
      if (!data.length) return;
      const files: string[] = [];
      for (const item of data) {
        const path = `${prefix}/${item.name}`;
        if (!safeAccountPath(userId, path) || item.name.includes("/")) throw new Error("An unexpected storage path prevented cleanup. No other account's files were removed.");
        if (item.id) files.push(path);
        else await clear(bucket, path, depth + 1);
      }
      if (files.length) {
        const { error: removeError } = await db.storage.from(bucket).remove(files);
        if (removeError) throw new Error("Uploaded files could not be removed. Retry deletion after checking Storage access.");
      }
    }
  }
  for (const bucket of ACCOUNT_BUCKETS) await clear(bucket, userId);
}

export async function deleteAccount(db: SupabaseClient, userId: string, confirmation: string, actor: { id: string | null; email: string }) {
  const lease = randomUUID();
  const args = { p_target: userId, p_actor: actor.id, p_email: actor.email };
  const { data: checkpoint, error: beginError } = await db.rpc("begin_admin_account_deletion", { ...args, p_confirmation: confirmation, p_lease: lease });
  if (beginError) throw new Error(beginError.code === "P0001" ? beginError.message : "Account controls are unavailable. Apply the admin-controls migration before deleting accounts.");
  if (checkpoint !== "deleting") throw new Error("The deletion lock could not be confirmed. No cleanup was started.");
  try {
    const { error: banError } = await db.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
    if (banError && banError.code !== "user_not_found") throw new Error("Sign-in access could not be disabled. Retry account cleanup after checking Supabase.");
    await removeAccountFiles(db, userId, Date.now() + 25000);
    const { error } = await db.auth.admin.deleteUser(userId, false);
    // A retry may follow a completed Auth deletion whose final audit failed.
    if (error && error.code !== "user_not_found") throw new Error("The authentication account could not be deleted. Check Supabase and retry; workspace access remains locked.");
    const { data: finished, error: finishError } = await db.rpc("finish_admin_account_deletion", { ...args, p_lease: lease, p_complete: true });
    if (finishError || finished !== true) throw new Error("Account removed, but its audit checkpoint is pending. Retry cleanup to finalize the record.");
  } catch (error) {
    await db.rpc("finish_admin_account_deletion", { ...args, p_lease: lease, p_complete: false });
    throw error;
  }
}
