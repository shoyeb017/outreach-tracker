// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SCHEDULE_TEST_MESSAGE } from "@/lib/scheduling/test-message";
let db: PGlite;
const owner = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222";
const dataset = "33333333-3333-4333-8333-333333333333", template = "44444444-4444-4444-8444-444444444444", row = "55555555-5555-4555-8555-555555555555", config = "66666666-6666-4666-8666-666666666666";
const connection = "77777777-7777-4777-8777-777777777777";
beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',created_at timestamptz default now(),last_sign_in_at timestamptz,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'service_role') $$;
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
    grant usage on schema public,auth to authenticated,anon,service_role;
  `);
  await db.exec(readFileSync("supabase/schema.sql", "utf8"));
  await db.exec("grant select,insert,update,delete on all tables in schema public to authenticated; grant all on all tables in schema public to service_role;");
  for (const migration of ["20261008_admin_microsoft.sql", "20261009_admin_controls.sql", "20261015_scheduled_mail.sql", "20261016_scheduled_test_mail.sql"]) await db.exec(readFileSync(`supabase/migrations/${migration}`, "utf8"));
}, 60000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`reset role; select set_config('request.jwt.claim.role','service_role',false); select set_config('request.jwt.claim.sub','',false);
    truncate auth.users cascade; truncate public.microsoft_default_configuration cascade; truncate public.admin_account_deletions;
    update public.scheduled_mail_control set enabled=true,last_tick_at=now(),lease_id=null,lease_until=null;
    insert into auth.users(id,email) values('${owner}','owner@example.com'),('${other}','other@example.com');
    insert into public.datasets(id,user_id,name) values('${dataset}','${owner}','Test spreadsheet');
    insert into public.templates(id,user_id,name,subject_template,html_body) values('${template}','${owner}','Test template','Subject','<p>Snapshot</p>');
    insert into public.dataset_rows(id,user_id,dataset_id,row_number,recipient_email,email_normalized,email_valid) values('${row}','${owner}','${dataset}',2,'reader@example.com','reader@example.com',true);
    insert into public.microsoft_default_configuration(id,client_id,tenant_id,enabled,updated_at) values('${config}','${config}','${config}',true,'2026-10-15T00:00:00Z');
    insert into public.microsoft_integrations(user_id,client_id,tenant_id,configuration_id,configuration_version,connection_method,home_account_id,connected_email,connection_status,resolved_authority)
      values('${owner}','${config}','${config}','${config}','2026-10-15T00:00:00Z','default','account','sender@example.com','connected','https://login.microsoftonline.com/common')
      on conflict(user_id) do update set client_id=excluded.client_id,tenant_id=excluded.tenant_id,configuration_id=excluded.configuration_id,configuration_version=excluded.configuration_version,connection_method=excluded.connection_method,home_account_id=excluded.home_account_id,connected_email=excluded.connected_email,connection_status=excluded.connection_status,resolved_authority=excluded.resolved_authority;
    insert into public.background_mail_connections(user_id,id,configuration_id,configuration_version,connection_method,client_id,authority,sender_email,microsoft_user_id,status,refresh_ciphertext,credential_ciphertext)
      values('${owner}','${connection}','${config}','2026-10-15T00:00:00Z','default','${config}','https://login.microsoftonline.com/common','sender@example.com','ms-user','connected','encrypted-fixture','encrypted-fixture');
    update public.user_preferences set live_sending_enabled=true where user_id='${owner}';
  `);
});
async function create(live = false, key = crypto.randomUUID()) {
  const items = [{ row_id: row, recipient_email: "reader@example.com", template_id: template, template_name: "Test template", subject: "Frozen subject", html_body: "<p>Frozen email</p>", plain_text_body: "Frozen email" }];
  const result = await db.query<{ id: string }>("select public.scheduler_create_batch($1,$2,now()+interval '10 minutes','Asia/Dhaka',$3,'block_template_recipient',$4,$5::jsonb) id", [owner, dataset, live, key, JSON.stringify(items)]);
  return result.rows[0].id;
}
async function due(id: string) { await db.query("update public.scheduled_mail_batches set scheduled_at=now()-interval '1 minute' where id=$1", [id]); await db.query("update public.scheduled_mail_items set next_attempt_at=now()-interval '1 minute' where batch_id=$1", [id]); }
async function start() { const lease = crypto.randomUUID(); await db.query("select public.scheduler_begin_tick($1)", [lease]); return lease; }
async function itemFor(id: string) { return (await db.query<{ id: string; status: string; attempts: number }>("select id,status,attempts from public.scheduled_mail_items where batch_id=$1", [id])).rows[0]; }
async function status(id: string) { return (await db.query<{ status: string }>("select status from public.scheduled_mail_batches where id=$1", [id])).rows[0].status; }
async function createTest(recipient = "test@example.com", key = crypto.randomUUID()) {
  return (await db.query<{ id: string }>("select public.scheduler_create_test($1,$2,now()+interval '10 minutes','Asia/Dhaka',$3,'sender@example.com') id", [owner,recipient,key])).rows[0].id;
}

describe("standalone scheduled dummy email", () => {
  it("creates one real test with a fixed snapshot and no fake dataset or template, idempotently", async () => {
    const key = crypto.randomUUID(); const id = await createTest(" Test@Example.com ",key);
    expect(await createTest("test@example.com",key)).toBe(id);
    expect((await db.query("select * from public.datasets")).rows).toHaveLength(1);
    expect((await db.query("select * from public.templates")).rows).toHaveLength(1);
    expect((await db.query<{ kind: string; dataset_id: string | null; live_enabled: boolean }>("select kind,dataset_id,live_enabled from public.scheduled_mail_batches where id=$1",[id])).rows[0]).toMatchObject({ kind: "test", dataset_id: null, live_enabled: true });
    const saved = (await db.query<{ recipient_email: string; subject: string; html_body: string; plain_text_body: string }>("select * from public.scheduled_mail_items where batch_id=$1",[id])).rows[0];
    expect(saved).toMatchObject({ recipient_email: "test@example.com", subject: SCHEDULE_TEST_MESSAGE.subject, html_body: SCHEDULE_TEST_MESSAGE.html, plain_text_body: SCHEDULE_TEST_MESSAGE.text });
    await due(id); const lease = await start(); const item = await itemFor(id);
    expect((await db.query<{ result: boolean }>("select public.scheduler_arm_item($1,$2) result",[item.id,lease])).rows[0].result).toBe(true);
    await db.query("select public.scheduler_finish_item($1,$2,'accepted')",[item.id,lease]); await db.exec("select public.scheduler_refresh_counts()");
    expect(await status(id)).toBe("completed");
    expect((await db.query<{ is_test: boolean; dataset_id: string | null }>("select is_test,dataset_id from public.email_history")).rows[0]).toMatchObject({ is_test: true, dataset_id: null });
  });
  it("requires real sending and a current worker even for a test", async () => {
    await db.query("update public.user_preferences set live_sending_enabled=false where user_id=$1",[owner]);
    await expect(createTest()).rejects.toThrow(/Real sending/);
    await db.query("update public.user_preferences set live_sending_enabled=true where user_id=$1",[owner]);
    await db.exec("update public.scheduled_mail_control set last_tick_at=null"); await expect(createTest()).rejects.toThrow(/worker/);
  });
  it("blocks missing background access, suppression, invalid input and unknown recipients", async () => {
    await expect(createTest("one@example.com,two@example.com")).rejects.toThrow(/one valid/);
    await db.query("insert into public.suppression_list(user_id,email,email_normalized) values($1,'test@example.com','test@example.com')",[owner]);
    await expect(createTest()).rejects.toThrow(/do-not-email/);
    await db.exec("delete from public.suppression_list; delete from public.background_mail_connections"); await expect(createTest()).rejects.toThrow(/background access/);
  });
  it("blocks overlapping tests and preserves unknown-send protection after cancellation", async () => {
    const id = await createTest(); await expect(createTest()).rejects.toThrow(/pending or unconfirmed/);
    await due(id); const lease=await start(); const item=await itemFor(id);
    await db.query("select public.scheduler_arm_item($1,$2)",[item.id,lease]);
    await db.query("select public.scheduler_change_batch($1,$2,'cancel')",[owner,id]);
    await db.query("select public.scheduler_finish_item($1,$2,'uncertain','Check Sent Items')",[item.id,lease]);
    await expect(createTest()).rejects.toThrow(/pending or unconfirmed/);
    await db.query("select public.scheduler_resolve_unknown($1,$2,$3,false)",[owner,id,item.id]);
    expect(await createTest()).toBeTruthy();
  });
  it("caps test creation at five per UTC day, including cancelled tests", async () => {
    for(let i=0;i<5;i++) { const id=await createTest(`test${i}@example.com`); await db.query("select public.scheduler_change_batch($1,$2,'cancel')",[owner,id]); await db.query("delete from public.send_runs where scheduled_batch_id=$1",[id]); }
    await expect(createTest("sixth@example.com")).rejects.toThrow(/5 scheduled test/);
  });
  it("pins the reviewed sender and refuses a confirmation previously used by a campaign", async () => {
    await expect(db.query("select public.scheduler_create_test($1,'test@example.com',now()+interval '10 minutes','Asia/Dhaka',$2,'different@example.com')",[owner,crypto.randomUUID()])).rejects.toThrow(/sender changed/);
    const key=crypto.randomUUID(); await create(false,key); await expect(createTest("test@example.com",key)).rejects.toThrow(/confirmation was already used/);
  });
  it("keeps test RPC service-only and ordinary queue source fields required", async () => {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.role','authenticated',false); select set_config('request.jwt.claim.sub','${owner}',false);`);
    await expect(createTest()).rejects.toThrow(/permission denied/);
    await expect(db.query("insert into public.send_runs(user_id,dataset_id) values($1,null)",[owner])).rejects.toThrow();
  });
  it("removes standalone tests and their history through normal owner-scoped application-data deletion",async () => {
    const id=await createTest(); await due(id); const lease=await start(); const item=await itemFor(id);
    await db.query("select public.scheduler_arm_item($1,$2)",[item.id,lease]); await db.query("select public.scheduler_finish_item($1,$2,'accepted')",[item.id,lease]);
    await db.query("insert into public.datasets(user_id,name) values($1,'Other owner spreadsheet')",[other]);
    await db.exec(`grant usage on schema storage to authenticated; grant select,delete on storage.objects to authenticated;
      set role authenticated; select set_config('request.jwt.claim.role','authenticated',false); select set_config('request.jwt.claim.sub','${owner}',false);
      select public.delete_my_application_data(); reset role; select set_config('request.jwt.claim.role','service_role',false);`);
    for(const table of ["scheduled_mail_batches","scheduled_mail_items","send_runs","send_run_items","email_history","background_mail_connections"]) expect((await db.query(`select * from public.${table} where user_id=$1`,[owner])).rows).toHaveLength(0);
    expect((await db.query("select * from public.datasets where user_id=$1",[other])).rows).toHaveLength(1);
    expect((await db.query("select * from auth.users where id=$1",[owner])).rows).toHaveLength(1);
    expect((await db.query<{ attempts: number; test_schedules: number }>("select attempts,test_schedules from public.scheduled_mail_daily_usage where user_id=$1",[owner])).rows[0]).toMatchObject({attempts:1,test_schedules:1});
  });
});

describe("actual PostgreSQL scheduling migration and transitions", () => {
  it("creates reviewed snapshots idempotently and isolates history from browser resume", async () => {
    const key = crypto.randomUUID(); const id = await create(false, key);
    expect(await create(false, key)).toBe(id);
    expect((await db.query<{ count: number }>("select count(*)::int count from public.send_runs")).rows[0].count).toBe(1);
    expect((await db.query<{ subject: string }>("select subject from public.scheduled_mail_items")).rows[0].subject).toBe("Frozen subject");
    expect((await db.query<{ scheduled_batch_id: string }>("select scheduled_batch_id from public.send_runs")).rows[0].scheduled_batch_id).toBe(id);
  });
  it("enforces owner RLS, service-only mutations and private credential tables", async () => {
    const id = await create();
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.role','authenticated',false); select set_config('request.jwt.claim.sub','${other}',false);`);
    expect((await db.query("select * from public.scheduled_mail_batches")).rows).toHaveLength(0);
    await expect(db.query("select * from public.background_mail_connections")).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.scheduler_begin_tick($1)", [crypto.randomUUID()])).rejects.toThrow(/permission denied/);
    await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);`);
    expect((await db.query("select * from public.scheduled_mail_batches where id=$1", [id])).rows).toHaveLength(1);
    await expect(db.query("update public.scheduled_mail_batches set scheduled_at=now()")).rejects.toThrow(/permission denied/);
    await expect(db.query("update public.send_runs set status='running' where scheduled_batch_id=$1", [id])).rejects.toThrow(/Scheduled emails/);
  });
  it("does not claim future work and honours the global pause switch", async () => {
    const id = await create(); const lease = await start();
    expect((await db.query<{ result: unknown }>("select public.scheduler_next_item($1) result", [lease])).rows[0].result).toBeNull();
    await due(id); await db.exec("update public.scheduled_mail_control set enabled=false");
    expect((await db.query<{ result: boolean }>("select public.scheduler_arm_item($1,$2) result", [(await itemFor(id)).id, lease])).rows[0].result).toBe(false);
  });
  it("rechecks suppression before claiming and skips without an attempt", async () => {
    const id = await create(true); await due(id); const lease = await start();
    await db.query("insert into public.suppression_list(user_id,email,email_normalized) values($1,'reader@example.com','reader@example.com')", [owner]);
    await db.query("select public.scheduler_arm_item($1,$2)", [(await itemFor(id)).id, lease]);
    expect(await itemFor(id)).toMatchObject({ status: "skipped", attempts: 0 });
    await db.exec("select public.scheduler_refresh_counts()"); expect(await status(id)).toBe("completed_with_errors");
  });
  it("applies the daily real-send cap and pauses instead of sending", async () => {
    const id = await create(true); await due(id); const lease = await start();
    await db.query("insert into public.scheduled_mail_daily_usage(user_id,day,attempts) values($1,(now() at time zone 'UTC')::date,100)", [owner]);
    await db.query("select public.scheduler_arm_item($1,$2)", [(await itemFor(id)).id, lease]);
    expect(await itemFor(id)).toMatchObject({ status: "pending", attempts: 0 }); expect(await status(id)).toBe("needs_attention");
  });
  it("converts a crashed in-flight attempt to unknown and never releases it automatically", async () => {
    const id = await create(true); await due(id); const lease = await start(); const item = await itemFor(id);
    await db.query("select public.scheduler_arm_item($1,$2)", [item.id, lease]);
    await db.query("update public.scheduled_mail_items set last_attempt_at=now()-interval '3 minutes' where id=$1", [item.id]);
    await db.exec("update public.scheduled_mail_control set lease_until=now()-interval '1 minute'");
    await start(); expect((await itemFor(id)).status).toBe("uncertain"); expect(await status(id)).toBe("needs_attention");
    await expect(db.query("select public.scheduler_change_batch($1,$2,'reschedule',now()+interval '10 minutes','Asia/Dhaka')", [owner,id])).rejects.toThrow(/unknown or in-flight/);
    await db.query("select public.scheduler_resolve_unknown($1,$2,$3,true)", [owner,id,item.id]);
    expect((await itemFor(id)).status).toBe("accepted");
    expect((await db.query<{ status: string }>("select status from public.email_history")).rows[0].status).toBe("sent");
  });
  it("stops overdue work and requires an explicit future reschedule", async () => {
    const id = await create(); await db.query("update public.scheduled_mail_batches set scheduled_at=now()-interval '20 minutes' where id=$1", [id]);
    await start(); expect(await status(id)).toBe("needs_attention");
    await db.query("select public.scheduler_change_batch($1,$2,'reschedule',now()+interval '10 minutes','Asia/Dhaka')", [owner,id]);
    expect(await status(id)).toBe("scheduled"); expect((await itemFor(id)).attempts).toBe(0);
  });
  it("disconnects background credentials and pauses schedules when the sender disconnects", async () => {
    const id = await create(true);
    await db.query("update public.microsoft_integrations set connection_status='not_connected',home_account_id=null,connected_email=null where user_id=$1", [owner]);
    const result = (await db.query<{ status: string; refresh_ciphertext: string | null }>("select status,refresh_ciphertext from public.background_mail_connections")).rows[0];
    expect(result).toMatchObject({ status: "disconnected", refresh_ciphertext: null }); expect(await status(id)).toBe("paused");
  });
  it("saves successful practice history and never counts it as a real duplicate", async () => {
    const id = await create(); await due(id); const lease = await start(); const item = await itemFor(id);
    await db.query("select public.scheduler_arm_item($1,$2)", [item.id,lease]);
    await db.query("select public.scheduler_finish_item($1,$2,'simulated')", [item.id,lease]);
    await db.exec("select public.scheduler_refresh_counts()"); expect(await status(id)).toBe("completed");
    expect((await db.query<{ status: string }>("select status from public.email_history")).rows[0].status).toBe("simulated");
    expect(await create(true)).toBeTruthy();
  });
  it("cancels pending items and prevents an unrelated owner from changing the schedule", async () => {
    const id = await create();
    await expect(db.query("select public.scheduler_change_batch($1,$2,'cancel')", [other,id])).rejects.toThrow(/not found/);
    await db.query("select public.scheduler_change_batch($1,$2,'cancel')", [owner,id]);
    expect(await status(id)).toBe("cancelled"); expect((await itemFor(id)).status).toBe("cancelled");
  });
  it("permits intentional repeated addresses within one batch when explicitly allowed", async () => {
    const second = crypto.randomUUID();
    await db.query("insert into public.dataset_rows(id,user_id,dataset_id,row_number,recipient_email,email_normalized,email_valid) values($1,$2,$3,3,'reader@example.com','reader@example.com',true)", [second, owner, dataset]);
    const items = [row, second].map((id) => ({ row_id: id, recipient_email: "reader@example.com", template_id: template, template_name: "Template", subject: "Hi", html_body: "<p>Reviewed</p>", plain_text_body: "Reviewed" }));
    const result = await db.query<{ id: string }>("select public.scheduler_create_batch($1,$2,now()+interval '10 minutes','Asia/Dhaka',true,'allow',$3,$4::jsonb) id", [owner,dataset,crypto.randomUUID(),JSON.stringify(items)]);
    expect(result.rows[0].id).toBeTruthy();
    expect((await db.query<{ count: number }>("select count(*)::int count from public.scheduled_mail_items")).rows[0].count).toBe(2);
  });
  it("revokes private background credentials when the browser deletes its Microsoft integration", async () => {
    const id = await create(true);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.role','authenticated',false); select set_config('request.jwt.claim.sub','${owner}',false); delete from public.microsoft_integrations where user_id='${owner}'; reset role;`);
    expect((await db.query("select * from public.background_mail_connections")).rows).toHaveLength(0); expect(await status(id)).toBe("paused");
  });
  it("immediately pauses real schedules when real sending is disabled", async () => { const id = await create(true); await db.query("update public.user_preferences set live_sending_enabled=false where user_id=$1", [owner]); expect(await status(id)).toBe("paused"); });
  it("prevents overlap between worker ticks and between browser/scheduled queues", async () => {
    const id = await create(true); const lease = await start();
    expect((await db.query<{ result: boolean }>("select public.scheduler_begin_tick($1) result", [crypto.randomUUID()])).rows[0].result).toBe(false);
    await due(id);
    const immediateRun = crypto.randomUUID(), immediateItem = crypto.randomUUID();
    await db.query("insert into public.send_runs(id,user_id,dataset_id,live_enabled) values($1,$2,$3,true)", [immediateRun,owner,dataset]);
    await db.query("insert into public.send_run_items(id,user_id,send_run_id,dataset_row_id,recipient_email,template_id) values($1,$2,$3,$4,'reader@example.com',$5)", [immediateItem,owner,immediateRun,row,template]);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.role','authenticated',false); select set_config('request.jwt.claim.sub','${owner}',false);`);
    await expect(db.query("select public.claim_send_run_item($1,0)", [immediateItem])).rejects.toThrow(/reserved by Scheduled emails/);
    await db.exec("reset role; select set_config('request.jwt.claim.role','service_role',false);");
    expect((await db.query<{ result: boolean }>("select public.scheduler_arm_item($1,$2) result", [(await itemFor(id)).id,lease])).rows[0].result).toBe(true);
    await db.query("select public.scheduler_change_batch($1,$2,'cancel')", [owner,id]);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.role','authenticated',false);`);
    await expect(db.query("select public.claim_send_run_item($1,0)", [immediateItem])).rejects.toThrow(/unknown send outcome/);
  });
  it("atomically pins the OAuth connection to the still-selected sender", async () => {
    const id = await create(true);
    const saved = (await db.query<Record<string, unknown>>("select * from public.background_mail_connections")).rows[0];
    const next = { ...saved, id: crypto.randomUUID() };
    await db.query("select public.scheduler_save_connection($1,'account',$2::jsonb)", [owner,JSON.stringify(next)]);
    expect(await status(id)).toBe("paused");
    expect((await db.query<{ id: string }>("select id from public.background_mail_connections")).rows[0].id).toBe(next.id);
    await db.query("update public.microsoft_integrations set connection_status='not_connected',home_account_id=null,connected_email=null where user_id=$1", [owner]);
    await expect(db.query("select public.scheduler_save_connection($1,'account',$2::jsonb)", [owner,JSON.stringify(next)])).rejects.toThrow(/changed during authorization/);
  });
  it("records interrupted practice as failed, not as an unknown real email", async () => {
    const id = await create(); await due(id); const lease = await start(); const item = await itemFor(id);
    await db.query("select public.scheduler_arm_item($1,$2)", [item.id,lease]);
    await db.query("update public.scheduled_mail_items set last_attempt_at=now()-interval '3 minutes' where id=$1", [item.id]);
    await db.exec("update public.scheduled_mail_control set lease_until=now()-interval '1 minute'"); await start();
    expect((await itemFor(id)).status).toBe("failed");
    expect((await db.query<{ status: string }>("select status from public.send_run_items")).rows[0].status).toBe("failed");
  });
  it("lets an administrator safely invalidate a deleting account without blocking other setup changes", async () => {
    await create(true);
    await db.query("insert into public.admin_account_deletions(user_id,status) values($1,'deleting')", [owner]);
    await expect(db.query("update public.background_mail_connections set status='connected' where user_id=$1", [owner])).rejects.toThrow(/being deleted/);
    await db.query("update public.microsoft_integrations set connection_status='not_connected',connected_email=null,home_account_id=null where user_id=$1", [owner]);
    expect((await db.query<{ status: string }>("select status from public.background_mail_connections")).rows[0].status).toBe("disconnected");
  });
});
