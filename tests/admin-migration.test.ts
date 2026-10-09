import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql=readFileSync("supabase/migrations/20261008_admin_microsoft.sql","utf8");
describe("additive administration SQL safeguards",()=>{
  it("enables RLS on every new table and restricts owner reads",()=>{for(const table of ["application_administrators","microsoft_default_configuration","microsoft_user_configurations","admin_audit_log","security_rate_limits"])expect(sql).toContain(`alter table public.${table} enable row level security`);expect(sql).toContain("using(user_id = auth.uid())");});
  it("restricts privileged RPCs and prevents client-forged connection verification",()=>{expect(sql).toContain("revoke all on function public.consume_security_limit(text,integer,integer) from public, anon, authenticated");expect(sql).toContain("grant execute on function public.save_microsoft_default(jsonb,uuid,text) to service_role");expect(sql).toContain("Use the authenticated Microsoft settings endpoint");expect(sql).toContain("config_version is distinct from new.configuration_version");});
  it("preserves legacy records and includes new configurations in explicit privacy reset",()=>{expect(sql).toContain("Existing Microsoft configuration");expect(sql).not.toMatch(/drop table|truncate /i);expect(sql).toContain("delete from public.microsoft_user_configurations where user_id = me");});
});
