// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteAccount, removeAccountFiles, safeAccountPath } from "@/lib/admin/account-controls";
import { adminDate, adminPageNumber } from "@/lib/admin/presentation";
const id = "22222222-2222-4222-8222-222222222222";
const actor = { id: null, email: "admin@example.com" };

function fixture(paths: string[] = []) {
  const files = new Set(paths);
  const list = vi.fn(async (prefix: string, options: { limit: number; offset: number }) => {
    const children = new Map<string, { name: string; id: string | null }>();
    for (const path of files) if (path.startsWith(prefix + "/")) {
      const parts = path.slice(prefix.length+1).split("/");
      children.set(parts[0], { name: parts[0], id: parts.length === 1 ? "file" : null });
    }
    return { data: [...children.values()].sort((a,b) => a.name.localeCompare(b.name)).slice(options.offset,options.offset+options.limit), error: null };
  });
  const remove = vi.fn(async (paths: string[]) => { paths.forEach(path => files.delete(path)); return { error: null }; });
  const rpc = vi.fn<(name: string, args: unknown) => Promise<{ data?: unknown; error: { code: string; message: string } | null }>>(async name => ({ data: name === "begin_admin_account_deletion" ? "deleting" : true, error: null }));
  const updateUserById = vi.fn(async () => ({ error: null as null | { code: string } }));
  const deleteUser = vi.fn(async () => ({ error: null as null | { code: string } }));
  const db = { rpc, storage: { from: vi.fn(() => ({ list, remove })) }, auth: { admin: { updateUserById, deleteUser } } } as unknown as SupabaseClient;
  return { db, files, list, remove, rpc, updateUserById, deleteUser };
}
describe("scoped administrator cleanup", () => {
  it("validates exact UUID-prefix paths and rejects traversal", () => {
    expect(safeAccountPath(id,id+"/logo.png")).toBe(true);
    for (const path of ["another/logo.png",id+"/../other",id+"/x\\y",id+"//file",id+"/."]) expect(safeAccountPath(id,path)).toBe(false);
  });
  it("removes multiple pages and nested files without skipping or touching another user", async () => {
    const f = fixture([...Array.from({length:225},(_,i)=>id+"/folder/file-"+i+".csv"),id+"/logo.png","other-user/logo.png"]);
    await removeAccountFiles(f.db,id,Date.now()+5000);
    expect([...f.files]).toEqual(["other-user/logo.png"]);
    expect(f.list.mock.calls.every(([,options])=>options.offset===0)).toBe(true);
    expect(f.db.storage.from).toHaveBeenCalledWith("imports");
    expect(f.db.storage.from).toHaveBeenCalledWith("signature-assets");
  });
  it("freezes and audits before banning, removing files, and hard-deleting Auth", async () => {
    const f = fixture([id+"/file.csv"]);
    await deleteAccount(f.db,id,"user@example.com",actor);
    expect(f.rpc).toHaveBeenNthCalledWith(1,"begin_admin_account_deletion",expect.objectContaining({ p_target:id,p_confirmation:"user@example.com",p_actor:null,p_email:actor.email }));
    expect(f.updateUserById).toHaveBeenCalledWith(id,{ban_duration:"876000h"});
    expect(f.rpc.mock.invocationCallOrder[0]).toBeLessThan(f.updateUserById.mock.invocationCallOrder[0]);
    expect(f.remove.mock.invocationCallOrder[0]).toBeLessThan(f.deleteUser.mock.invocationCallOrder[0]);
    expect(f.deleteUser).toHaveBeenCalledWith(id,false);
    expect(f.rpc).toHaveBeenLastCalledWith("finish_admin_account_deletion",expect.objectContaining({p_complete:true,p_target:id}));
  });
  it.each(["Administrator accounts cannot be deleted here.","Enter the account email exactly to confirm deletion.","Cleanup is already running."])("does nothing destructive when the transactional guard rejects: %s",async message=>{
    const f = fixture(); f.rpc.mockResolvedValueOnce({error:{code:"P0001",message}});
    await expect(deleteAccount(f.db,id,"user@example.com",actor)).rejects.toThrow(message);
    expect(f.updateUserById).not.toHaveBeenCalled(); expect(f.remove).not.toHaveBeenCalled(); expect(f.deleteUser).not.toHaveBeenCalled();
  });
  it("fails closed when the migration or initial audit is unavailable", async () => {
    const f = fixture(); f.rpc.mockResolvedValueOnce({error:{code:"42883",message:"function missing"}});
    await expect(deleteAccount(f.db,id,"user@example.com",actor)).rejects.toThrow("migration");
    expect(f.deleteUser).not.toHaveBeenCalled();
  });
  it("requires a confirmed deletion lock, not just an error-free response",async()=>{
    const f=fixture();f.rpc.mockResolvedValueOnce({data:null,error:null});
    await expect(deleteAccount(f.db,id,"user@example.com",actor)).rejects.toThrow("lock could not be confirmed");
    expect(f.updateUserById).not.toHaveBeenCalled();expect(f.remove).not.toHaveBeenCalled();
  });
  it("retains the lock and records a retry checkpoint after Storage failure",async()=>{
    const f=fixture(); f.list.mockRejectedValueOnce(new Error("Storage unavailable"));
    await expect(deleteAccount(f.db,id,"user@example.com",actor)).rejects.toThrow("Storage unavailable");
    expect(f.deleteUser).not.toHaveBeenCalled();
    expect(f.rpc).toHaveBeenLastCalledWith("finish_admin_account_deletion",expect.objectContaining({p_complete:false}));
  });
  it("can finish a pending audit after Auth deletion has already succeeded",async()=>{
    const f=fixture(); f.updateUserById.mockResolvedValue({error:{code:"user_not_found"}}); f.deleteUser.mockResolvedValue({error:{code:"user_not_found"}});
    await deleteAccount(f.db,id,"user@example.com",actor);
    expect(f.rpc).toHaveBeenLastCalledWith("finish_admin_account_deletion",expect.objectContaining({p_complete:true}));
  });
  it("does not report success if Auth deletion or final audit fails",async()=>{
    const f=fixture(); f.deleteUser.mockResolvedValue({error:{code:"unexpected_failure"}});
    await expect(deleteAccount(f.db,id,"user@example.com",actor)).rejects.toThrow("could not be deleted");
    expect(f.rpc).toHaveBeenLastCalledWith("finish_admin_account_deletion",expect.objectContaining({p_complete:false}));
    const audit=fixture(); audit.rpc.mockResolvedValueOnce({data:"deleting",error:null}).mockResolvedValueOnce({error:{code:"error",message:"audit down"}});
    await expect(deleteAccount(audit.db,id,"user@example.com",actor)).rejects.toThrow("audit checkpoint");
  });
  it("bounds cleanup duration",async()=>{
    const f=fixture(); await expect(removeAccountFiles(f.db,id,Date.now()-1)).rejects.toThrow("another pass"); expect(f.remove).not.toHaveBeenCalled();
  });
  it("formats dates and constrains page numbers",()=>{
    expect(adminDate(null)).toBe("Never"); expect(adminDate("invalid")).toBe("Unavailable"); expect(adminDate("2026-10-09T12:00:00Z")).toContain("UTC");
    expect(adminPageNumber("1.8")).toBe(1); expect(adminPageNumber("Infinity")).toBe(1); expect(adminPageNumber("-5")).toBe(1); expect(adminPageNumber("999999")).toBe(100000);
  });
});
