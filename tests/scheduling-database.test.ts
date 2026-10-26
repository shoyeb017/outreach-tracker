// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ENGAGEMENT_PREVIEW_URL, defaultEngagement } from "@/lib/engagement/core";
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
  for (const migration of ["20261008_admin_microsoft.sql", "20261009_admin_controls.sql", "20261015_scheduled_mail.sql", "20261016_scheduled_test_mail.sql", "20261019_email_engagement.sql", "20261019_history_followups.sql", "20261019_record_deletion.sql", "20261026_spreadsheet_email_body.sql"]) await db.exec(readFileSync(`supabase/migrations/${migration}`, "utf8"));
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

const engagementSettings = { ...defaultEngagement, enabled: true, destination: "https://inuberry.com/services", origin: "https://autmail.vercel.app" };
async function seedEngagement() {
  await db.query("insert into public.email_engagement_settings(user_id,enabled,destination) values($1,true,$2)", [owner,engagementSettings.destination]);
  await db.query("insert into public.dataset_columns(user_id,dataset_id,original_label,placeholder_slug,standard_field) values($1,$2,'Contact email','contact_email','recipient_email'),($1,$2,'Company','company',null)", [owner,dataset]);
  await db.query("insert into public.dataset_placeholder_mappings(user_id,dataset_id,placeholder,column_id) select $1,$2,'company_name',id from public.dataset_columns where dataset_id=$2 and placeholder_slug='company'",[owner,dataset]);
  await db.query("update public.dataset_rows set data=$1,original_data=$1 where id=$2",[JSON.stringify({contact_email:"reader@example.com",company:"Original company"}),row]);
}
async function trackedItem(options: { live?: boolean; test?: boolean; status?: string; recipient?: string } = {}) {
  const run=crypto.randomUUID(), item=crypto.randomUUID();
  await db.query("insert into public.send_runs(id,user_id,dataset_id,live_enabled,is_test,status) values($1,$2,$3,$4,$5,'paused')",[run,owner,dataset,options.live??true,options.test??false]);
  await db.query("insert into public.send_run_items(id,user_id,send_run_id,dataset_row_id,recipient_email,template_id,resolved_subject,resolved_html_body,resolved_plain_text_body,status,attempts,engagement_snapshot) values($1,$2,$3,$4,$5,$6,'Test subject',$7,$8,$9,1,$10)", [item,owner,run,row,options.recipient??"reader@example.com",template,`<p>Message</p><a href="${ENGAGEMENT_PREVIEW_URL}">Visit</a>`,ENGAGEMENT_PREVIEW_URL,options.status??"sending",JSON.stringify(engagementSettings)]);
  return item;
}
async function prepareTracked(item: string) {
  const result=(await db.query<{data:{htmlBody:string}}>("select public.engagement_prepare_send($1,'https://autmail.vercel.app') data",[item])).rows[0].data;
  const token=result.htmlBody.match(/\/e\/([a-f0-9]{64})/)![1];
  const message=(await db.query<{id:string;token_hash:string}>("select id,token_hash from public.email_engagement_messages where send_run_item_id=$1",[item])).rows[0];
  return {...message,token,html:result.htmlBody};
}
async function acceptTracked(item:string) { await db.query("update public.send_run_items set status='sent',sent_at=now()-interval '20 seconds' where id=$1",[item]); }
async function visit(hash:string,kind="visit",viewer:string|null=null) { return (await db.query<{dest:string|null}>("select public.engagement_visit($1,$2,$3) dest",[hash,kind,viewer])).rows[0].dest; }
async function messageFor(item:string) { return (await db.query<{status:string;activity_count:number;suspected_count:number;accepted_at:string|null}>("select status,activity_count,suspected_count,accepted_at from public.email_engagement_messages where send_run_item_id=$1",[item])).rows[0]; }

describe("email engagement database protections",()=>{
  it("does not create tokens for views, queued items, tests, or practice",async()=>{
    await seedEngagement();
    for(const options of [{status:"queued"},{live:false},{test:true}]) await expect(prepareTracked(await trackedItem(options))).rejects.toThrow(/claimed real email/);
    expect((await db.query("select * from public.email_engagement_messages")).rows).toHaveLength(0);
  });
  it("creates a private random link before Graph, activates only on acceptance, and is idempotent",async()=>{
    await seedEngagement(); const item=await trackedItem(), m=await prepareTracked(item);
    expect(m.token).toHaveLength(64); expect(m.token_hash).not.toBe(m.token); expect(m.html).not.toContain("reader@example.com");
    expect(await prepareTracked(item)).toEqual(m);
    expect(await visit(m.token_hash)).toBe(engagementSettings.destination); expect((await messageFor(item)).activity_count).toBe(0);
    await acceptTracked(item); expect((await messageFor(item)).status).toBe("accepted");
    await visit(m.token_hash); await visit(m.token_hash); expect((await messageFor(item)).activity_count).toBe(1);
  });
  it("uses different links for separate sends to the same address",async()=>{
    await seedEngagement(); const a=await prepareTracked(await trackedItem()),b=await prepareTracked(await trackedItem()); expect(a.token).not.toBe(b.token);
  });
  it("does not record failed/unconfirmed sends, owner visits, HEAD or prefetch kinds",async()=>{
    await seedEngagement(); const item=await trackedItem(),m=await prepareTracked(item);
    await db.query("update public.send_run_items set status='failed' where id=$1",[item]); await visit(m.token_hash); expect((await messageFor(item)).activity_count).toBe(0);
    await acceptTracked(item); await visit(m.token_hash,"visit",owner); await visit(m.token_hash,"ignore"); expect((await messageFor(item)).activity_count).toBe(0);
    await visit(m.token_hash,"suspected"); expect((await messageFor(item)).suspected_count).toBe(1);
  });
  it("keeps very early visits separate and pauses collection without changing a sent destination",async()=>{
    await seedEngagement(); const item=await trackedItem(),m=await prepareTracked(item);
    await db.query("update public.send_run_items set status='sent',sent_at=now() where id=$1",[item]); await visit(m.token_hash);
    expect(await messageFor(item)).toMatchObject({activity_count:0,suspected_count:1});
    await db.query("update public.email_engagement_settings set collection_enabled=false,destination='https://example.com/new' where user_id=$1",[owner]);
    expect((await db.query<{data:{collectionEnabled:boolean}}>("select public.engagement_sources($1) data",[owner])).rows[0].data.collectionEnabled).toBe(false);
    expect(await visit(m.token_hash)).toBe("https://inuberry.com/services"); expect((await messageFor(item)).activity_count).toBe(0);
  });
  it("expires links and deletes bounded old records",async()=>{
    await seedEngagement(); const item=await trackedItem(),m=await prepareTracked(item); await acceptTracked(item);
    await db.query("update public.email_engagement_messages set expires_at=now()-interval '1 minute' where id=$1",[m.id]); expect(await visit(m.token_hash)).toBeNull();
    await db.query("select public.engagement_prune()"); expect(await messageFor(item)).toBeUndefined();
  });
  it("has no browser or anonymous access to hashes, counters or privileged RPCs",async()=>{
    await seedEngagement(); await prepareTracked(await trackedItem());
    const foreign=crypto.randomUUID();await db.query("insert into public.datasets(id,user_id,name) values($1,$2,'Another workspace')",[foreign,other]);
    for(const role of ["anon","authenticated"]) {
      await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub','${owner}',false); select set_config('request.jwt.claim.role','${role}',false);`);
      try {
        if(role==="authenticated") await expect(db.query("update public.datasets set engagement_source_dataset_id=$1 where id=$2",[foreign,dataset])).rejects.toThrow(/ownership mismatch/);
        await expect(db.query("select * from public.email_engagement_messages")).rejects.toThrow(/permission denied/);
        await expect(db.query("select public.engagement_prepare_send($1,'https://autmail.vercel.app')",[row])).rejects.toThrow(/permission denied/);
        await expect(db.query("select public.engagement_create_followup($1,$2,'Unsafe',$3)",[owner,[],crypto.randomUUID()])).rejects.toThrow(/permission denied/);
      } finally { await db.exec("reset role; select set_config('request.jwt.claim.role','service_role',false)"); }
    }
  });
  it("copies send-time row values and remaps columns, deduplicates addresses, excludes suppression and requires a fresh template",async()=>{
    await seedEngagement(); const a=await trackedItem();const ma=await prepareTracked(a);await acceptTracked(a);
    await db.query("update public.dataset_rows set data=jsonb_set(data,'{company}','\"Latest company\"') where id=$1",[row]);
    const b=await trackedItem(),mb=await prepareTracked(b);await acceptTracked(b);
    const c=await trackedItem({recipient:"blocked@example.com"}),mc=await prepareTracked(c);await acceptTracked(c);
    await db.query("insert into public.suppression_list(user_id,email,email_normalized) values($1,'blocked@example.com','blocked@example.com')",[owner]);
    const key=crypto.randomUUID();const args=[owner,[ma.id,mb.id,mc.id],"My follow-up",key];
    const result=(await db.query<{data:{id:string;added:number;omitted:number}}>("select public.engagement_create_followup($1,$2,$3,$4) data",args)).rows[0].data;
    expect(result).toMatchObject({added:1,omitted:2});
    const copy=(await db.query<{row_count:number;fallback_template_id:null;engagement_source_dataset_id:string}>("select * from public.datasets where id=$1",[result.id])).rows[0];
    expect(copy).toMatchObject({row_count:1,fallback_template_id:null,engagement_source_dataset_id:dataset});
    expect((copy as typeof copy & {engagement_source_campaign_ids:string[]}).engagement_source_campaign_ids).toHaveLength(3);
    const values=(await db.query<{data:Record<string,string>}>("select data from public.dataset_rows where dataset_id=$1",[result.id])).rows[0].data;
    expect(values.company).toBe("Latest company");expect(values.contact_email).toBe("reader@example.com");
    expect((await db.query("select * from public.dataset_placeholder_mappings where dataset_id=$1",[result.id])).rows).toHaveLength(1);
    expect((await db.query<{data:{id:string;existing:boolean}}>("select public.engagement_create_followup($1,$2,$3,$4) data",args)).rows[0].data).toMatchObject({id:result.id,existing:true});
    expect((await db.query("select * from public.send_runs where dataset_id=$1",[result.id])).rows).toHaveLength(0);
  });
  it("rejects foreign, failed or empty follow-up selections without creating a spreadsheet",async()=>{
    await seedEngagement();const item=await trackedItem(),m=await prepareTracked(item);
    await expect(db.query("select public.engagement_create_followup($1,$2,'Follow-up',$3)",[owner,[m.id],crypto.randomUUID()])).rejects.toThrow(/unavailable/);
    await acceptTracked(item);
    await expect(db.query("select public.engagement_create_followup($1,$2,'Follow-up',$3)",[other,[m.id],crypto.randomUUID()])).rejects.toThrow(/unavailable/);
    await expect(db.query("select public.engagement_create_followup($1,$2,'Follow-up',$3)",[owner,[],crypto.randomUUID()])).rejects.toThrow(/Select/);
  });
  it("freezes scheduled customization, prepares the link after arming, and writes the same final body to history",async()=>{
    await seedEngagement(); const items=[{row_id:row,recipient_email:"reader@example.com",template_id:template,template_name:"Test template",subject:"Frozen subject",html_body:`<a href="${ENGAGEMENT_PREVIEW_URL}">Visit</a>`,plain_text_body:ENGAGEMENT_PREVIEW_URL,engagement_snapshot:engagementSettings}];
    const b=(await db.query<{id:string}>("select public.scheduler_create_batch($1,$2,now()+interval '10 minutes','Asia/Dhaka',true,'allow',$3,$4) id",[owner,dataset,crypto.randomUUID(),JSON.stringify(items)])).rows[0].id;
    await due(b);const lease=await start();const i=await itemFor(b);await db.query("select public.scheduler_arm_item($1,$2,true)",[i.id,lease]);
    const link=await prepareTracked((await db.query<{send_run_item_id:string}>("select send_run_item_id from public.scheduled_mail_items where id=$1",[i.id])).rows[0].send_run_item_id);
    await db.query("select public.scheduler_finish_item($1,$2,'accepted')",[i.id,lease]);
    expect((await db.query<{final_html_body:string}>("select final_html_body from public.email_history where send_run_item_id=(select send_run_item_id from public.scheduled_mail_items where id=$1)",[i.id])).rows[0].final_html_body).toBe(link.html);
    expect((await db.query<{status:string}>("select status from public.email_engagement_messages where id=$1",[link.id])).rows[0].status).toBe("accepted");
    const second=(await db.query<{id:string}>("select public.scheduler_create_batch($1,$2,now()+interval '10 minutes','Asia/Dhaka',true,'allow',$3,$4) id",[owner,dataset,crypto.randomUUID(),JSON.stringify(items)])).rows[0].id;
    await due(second);await db.query("select public.scheduler_next_item($1)",[lease]);const legacy=await itemFor(second);
    expect((await db.query<{armed:boolean}>("select public.scheduler_arm_item($1,$2) armed",[legacy.id,lease])).rows[0].armed).toBe(false);
    expect((await db.query<{status:string}>("select status from public.scheduled_mail_batches where id=$1",[second])).rows[0].status).toBe("needs_attention");
  });
});

async function saveHistory(item: string, status = "sent", test = false) {
  return (await db.query<{ id: string }>(
    "insert into public.email_history(user_id,dataset_id,dataset_row_id,send_run_id,send_run_item_id,template_id,recipient_email,subject,final_html_body,status,is_test) select user_id,$2,dataset_row_id,send_run_id,id,template_id,recipient_email,resolved_subject,resolved_html_body,$3,$4 from public.send_run_items where id=$1 returning id",
    [item,dataset,status,test])).rows[0].id;
}
async function historyFollowup(ids: (string | null)[], account = owner, key = crypto.randomUUID()) {
  return (await db.query<{ data: { id: string; added: number; omitted: number; existing?: boolean } }>(
    "select public.history_create_followup($1,$2,'History follow-up',$3) data",[account,ids,key])).rows[0].data;
}
describe("history follow-up creation without click activity", () => {
  it("saves skipped and cancelled scheduled results in shared history without sending", async () => {
    const cancelled = await create(true);
    await db.query("select public.scheduler_change_batch($1,$2,'cancel')",[owner,cancelled]);
    expect((await db.query<{status:string}>("select status from public.email_history")).rows[0].status).toBe("cancelled");
    const skipped = await create(true); await due(skipped); const lease=await start(); const i=await itemFor(skipped);
    await db.query("insert into public.suppression_list(user_id,email,email_normalized) values($1,'reader@example.com','reader@example.com')",[owner]);
    expect((await db.query<{armed:boolean}>("select public.scheduler_arm_item($1,$2) armed",[i.id,lease])).rows[0].armed).toBe(false);
    expect((await db.query<{status:string;error_message:string}>("select status,error_message from public.email_history where send_run_item_id=(select send_run_item_id from public.scheduled_mail_items where id=$1)",[i.id])).rows[0]).toMatchObject({status:"skipped",error_message:expect.stringMatching(/do-not-email|suppressed/i)});
  });
  it("copies an untracked email using current row data, remaps columns and never sends", async () => {
    await seedEngagement();
    const h = await saveHistory(await trackedItem());
    const key = crypto.randomUUID(), result = await historyFollowup([h],owner,key);
    expect(result.added).toBe(1);
    const values = (await db.query<{ data: { company: string; contact_email: string } }>("select data from public.dataset_rows where dataset_id=$1",[result.id])).rows[0].data;
    expect(values).toMatchObject({company:"Original company",contact_email:"reader@example.com"});
    expect((await db.query("select * from public.dataset_placeholder_mappings where dataset_id=$1",[result.id])).rows).toHaveLength(1);
    expect((await db.query<{followup_source:string;fallback_template_id:null}>("select followup_source,fallback_template_id from public.datasets where id=$1",[result.id])).rows[0]).toMatchObject({followup_source:"history",fallback_template_id:null});
    expect((await historyFollowup([h],owner,key))).toMatchObject({id:result.id,existing:true});
    expect((await db.query("select * from public.send_runs where dataset_id=$1",[result.id])).rows).toHaveLength(0);
    expect((await db.query("select * from public.email_engagement_messages")).rows).toHaveLength(0);
  });
  it("uses a zero-click tracked snapshot instead of later source edits", async () => {
    await seedEngagement();
    const item = await trackedItem(); await prepareTracked(item); await acceptTracked(item);
    const h = await saveHistory(item);
    await db.query("update public.dataset_rows set data=jsonb_set(data,'{company}','\"Changed company\"') where id=$1",[row]);
    const result = await historyFollowup([h]);
    expect((await db.query<{data:{company:string}}>("select data from public.dataset_rows where dataset_id=$1",[result.id])).rows[0].data.company).toBe("Original company");
  });
  it("deduplicates all outcomes, excludes invalid and suppressed emails, and retains the actual sent-to email", async () => {
    await seedEngagement();
    const a = await saveHistory(await trackedItem({recipient:"different@example.com"}),"failed");
    const b = await saveHistory(await trackedItem({recipient:"different@example.com"}),"skipped");
    const blocked = await saveHistory(await trackedItem({recipient:"blocked@example.com"}));
    const invalid = await saveHistory(await trackedItem({recipient:"not-an-email"}),"skipped");
    await db.query("insert into public.suppression_list(user_id,email,email_normalized) values($1,'blocked@example.com','blocked@example.com')",[owner]);
    const result = await historyFollowup([a,b,blocked,invalid]);
    expect(result).toMatchObject({added:1,omitted:3});
    expect((await db.query<{data:{contact_email:string}}>("select data from public.dataset_rows where dataset_id=$1",[result.id])).rows[0].data.contact_email).toBe("different@example.com");
  });
  it("rejects other users, null IDs, test emails and all-blocked selections atomically", async () => {
    await seedEngagement();
    const item = await trackedItem(), h = await saveHistory(item);
    await expect(historyFollowup([h],other)).rejects.toThrow(/unavailable/);
    await expect(historyFollowup([h,null])).rejects.toThrow(/unavailable/);
    await db.query("update public.email_history set is_test=true where id=$1",[h]);
    await expect(historyFollowup([h])).rejects.toThrow(/test emails/);
    await db.query("update public.email_history set is_test=false where id=$1",[h]);
    await db.query("insert into public.suppression_list(user_id,email,email_normalized) values($1,'reader@example.com','reader@example.com')",[owner]);
    await expect(historyFollowup([h])).rejects.toThrow(/No eligible/);
    expect((await db.query("select * from public.datasets where followup_source='history'")).rows).toHaveLength(0);
    expect((await db.query("select * from public.email_history_followups")).rows).toHaveLength(0);
  });
  it("is service-only and clears private follow-up keys with application data", async () => {
    await seedEngagement();
    const h = await saveHistory(await trackedItem()); await historyFollowup([h]);
    await db.exec(`grant usage on schema storage to authenticated; grant select,delete on storage.objects to authenticated; set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false); select set_config('request.jwt.claim.role','authenticated',false);`);
    await expect(historyFollowup([h])).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from public.email_history_followups")).rejects.toThrow(/permission denied/);
    await db.exec("select public.delete_my_application_data(); reset role; select set_config('request.jwt.claim.role','service_role',false)");
    expect((await db.query("select * from public.email_history_followups")).rows).toHaveLength(0);
  });
});

async function deleteRecords(kind: string, ids: string[], account = owner) {
  return (await db.query<{ data: { removed: number; retainedSafetyLogs: boolean } }>(
    "select public.records_delete_selection($1,$2,$3) data",[account,kind,ids])).rows[0].data;
}
describe("safe individual and bulk record deletion", () => {
  it("removes history from its list without weakening recipient/template duplicate protection", async () => {
    await seedEngagement(); const item = await trackedItem(); await acceptTracked(item); const h = await saveHistory(item);
    expect(await deleteRecords("history",[h])).toMatchObject({removed:1,retainedSafetyLogs:true});
    expect((await db.query("select * from public.email_history where deleted_at is null")).rows).toHaveLength(0);
    expect((await db.query("select * from public.email_history where status='sent' and recipient_email='reader@example.com'")).rows).toHaveLength(1);
    expect((await db.query("select * from public.send_run_items where id=$1",[item])).rows).toHaveLength(1);
    expect((await deleteRecords("history",[h])).removed).toBe(0);
    await expect(historyFollowup([h])).rejects.toThrow(/removed/);
  });
  it("allows history removal across spreadsheets and includes test entries without changing source rows", async () => {
    await seedEngagement(); const a=await trackedItem(); await acceptTracked(a); const h1=await saveHistory(a);
    const b=await trackedItem({test:true}); await acceptTracked(b); const h2=await saveHistory(b,"sent",true);
    expect((await deleteRecords("history",[h1,h2])).removed).toBe(2);
    expect((await db.query("select * from public.dataset_rows where dataset_id=$1",[dataset])).rows).toHaveLength(1);
  });
  it("permanently deletes selected engagement rows, disables only those links and keeps email history", async () => {
    await seedEngagement();
    const a=await trackedItem(), ma=await prepareTracked(a); await acceptTracked(a); await saveHistory(a);
    const b=await trackedItem(), mb=await prepareTracked(b); await acceptTracked(b);
    expect((await deleteRecords("engagement",[ma.id])).removed).toBe(1);
    expect(await visit(ma.token_hash)).toBeNull(); expect(await visit(mb.token_hash)).toBe(engagementSettings.destination);
    expect((await db.query("select * from public.email_history")).rows).toHaveLength(1);
  });
  it("protects pending/unknown engagement and rejects mixed foreign selections atomically", async () => {
    await seedEngagement(); const a=await trackedItem(),ma=await prepareTracked(a);
    await expect(deleteRecords("engagement",[ma.id])).rejects.toThrow(/Pending/);
    await acceptTracked(a);
    await expect(deleteRecords("engagement",[ma.id,crypto.randomUUID()])).rejects.toThrow(/unavailable/);
    await expect(deleteRecords("engagement",[ma.id],other)).rejects.toThrow(/unavailable/);
    expect((await db.query("select * from public.email_engagement_messages")).rows).toHaveLength(1);
  });
  it("removes finished schedules only and preserves runs, history and unknown-send protection", async () => {
    const b=await create(true);
    await expect(deleteRecords("schedule",[b])).rejects.toThrow(/Only finished/);
    await due(b); const lease=await start(); const item=await itemFor(b);
    await db.query("select public.scheduler_arm_item($1,$2)",[item.id,lease]);
    await db.query("select public.scheduler_change_batch($1,$2,'cancel')",[owner,b]);
    await db.query("select public.scheduler_finish_item($1,$2,'uncertain','Check Sent Items')",[item.id,lease]);
    await expect(deleteRecords("schedule",[b])).rejects.toThrow(/Only finished/);
    await db.query("select public.scheduler_resolve_unknown($1,$2,$3,false)",[owner,b,item.id]);
    expect((await deleteRecords("schedule",[b])).removed).toBe(1);
    expect((await db.query("select * from public.scheduled_mail_batches where deleted_at is null")).rows).toHaveLength(0);
    expect((await db.query("select * from public.send_runs where scheduled_batch_id=$1",[b])).rows).toHaveLength(1);
    expect((await db.query("select * from public.email_history")).rows).toHaveLength(1);
  });
  it("rejects unknown kinds, excessive IDs and browser execution", async () => {
    await expect(deleteRecords("users",[])).rejects.toThrow(/Choose/);
    await expect(deleteRecords("history",Array(501).fill(crypto.randomUUID()))).rejects.toThrow(/Choose/);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false); select set_config('request.jwt.claim.role','authenticated',false);`);
    await expect(deleteRecords("history",[crypto.randomUUID()])).rejects.toThrow(/permission denied/);
  });
});

describe("spreadsheet-body campaign storage and scheduling", () => {
  const emailCol = "88888888-8888-4888-8888-888888888881", subjectCol = "88888888-8888-4888-8888-888888888882", bodyCol = "88888888-8888-4888-8888-888888888883";
  async function setupColumns() {
    await db.query("insert into public.dataset_columns(id,user_id,dataset_id,original_label,placeholder_slug,display_order) values($1,$4,$5,'Email','email',0),($2,$4,$5,'Subject','subject',1),($3,$4,$5,'Message','message',2)", [emailCol,subjectCol,bodyCol,owner,dataset]);
    await db.query("update public.dataset_rows set data=$1::jsonb where id=$2", [JSON.stringify({email:"reader@example.com", subject:"Sheet subject",message:"Sheet body"}),row]);
  }
  async function asOwner() { await db.exec("set role authenticated"); await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[owner]); }
  async function service() { await db.exec("reset role; select set_config('request.jwt.claim.role','service_role',false),set_config('request.jwt.claim.sub','',false)"); }
  async function saveBody() { await db.query("select public.save_spreadsheet_content_setup($1,$2,null,null,$3,'spreadsheet',$4,false)",[dataset,emailCol,subjectCol,bodyCol]); }
  async function source() { await setupColumns(); await asOwner(); await saveBody(); await service(); }
  async function bodySchedule(items?: unknown[], policy = "block_template_recipient", live = true) {
    const payload = items ?? [{row_id:row,recipient_email:"reader@example.com",template_id:null,content_key:"spreadsheet:"+dataset,template_name:"Spreadsheet body: Message",subject:"Frozen sheet subject",html_body:"<p>Frozen sheet body</p>",plain_text_body:"Frozen sheet body"}];
    return (await db.query<{id:string}>("select public.scheduler_create_batch($1,$2,now()+interval '10 minutes','Asia/Dhaka',$3,$4,$5,$6::jsonb) id",[owner,dataset,live,policy,crypto.randomUUID(),JSON.stringify(payload)])).rows[0].id;
  }
  it("saves body, subject, recipient and signature choices atomically without a template", async () => {
    await setupColumns(); await asOwner(); await saveBody();
    expect((await db.query("select body_source,body_column_id,spreadsheet_signature,subject_strategy,fallback_template_id,routing_column_id from public.datasets where id=$1",[dataset])).rows[0]).toMatchObject({body_source:"spreadsheet",body_column_id:bodyCol,spreadsheet_signature:false,subject_strategy:"spreadsheet",fallback_template_id:null,routing_column_id:null});
    expect((await db.query("select subject_value,recipient_email from public.dataset_rows where id=$1",[row])).rows[0]).toMatchObject({subject_value:"Sheet subject",recipient_email:"reader@example.com"});
    const result = (await db.query<{entry:{chosen_template_name:string}}>("select public.review_spreadsheet_rows($1) entry",[dataset])).rows[0].entry;
    expect(result.chosen_template_name).toBe("Spreadsheet body: Message");
    expect((await db.query("select * from public.review_spreadsheet_rows($1,'','all','missing_template')",[dataset])).rows).toHaveLength(0);
  });
  it("rejects overlapping, missing or foreign columns and cross-owner access", async () => {
    await setupColumns(); await asOwner();
    await expect(db.query("select public.save_spreadsheet_content_setup($1,$2,null,null,$3,'spreadsheet',$2,true)",[dataset,emailCol,subjectCol])).rejects.toThrow(/different columns/);
    await expect(db.query("select public.save_spreadsheet_content_setup($1,$2,null,null,$3,'spreadsheet',$4,true)",[dataset,emailCol,subjectCol,crypto.randomUUID()])).rejects.toThrow(/from this spreadsheet/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
    await expect(saveBody()).rejects.toThrow(/not found/);
    await service();
    expect((await db.query("select body_source from public.datasets where id=$1",[dataset])).rows[0]).toMatchObject({body_source:"template"});
  });
  it("can switch back to templates without leaving hidden spreadsheet mode active", async () => {
    await source(); await asOwner();
    await db.query("select public.save_spreadsheet_content_setup($1,$2,null,$3,null,'template',null,true)",[dataset,emailCol,template]);
    expect((await db.query("select body_source,body_column_id,subject_strategy,fallback_template_id from public.datasets where id=$1",[dataset])).rows[0]).toMatchObject({body_source:"template",body_column_id:null,subject_strategy:"template",fallback_template_id:template});
  });
  it("snapshots a template-free scheduled email and records its accepted outcome in shared history", async () => {
    await source(); const id=await bodySchedule(); await due(id); const lease=await start(); const item=await itemFor(id);
    expect((await db.query("select template_id,content_key,subject from public.scheduled_mail_items where id=$1",[item.id])).rows[0]).toMatchObject({template_id:null,content_key:"spreadsheet:"+dataset,subject:"Frozen sheet subject"});
    await db.query("update public.dataset_rows set data='{}' where id=$1",[row]);
    expect((await db.query<{ok:boolean}>("select public.scheduler_arm_item($1,$2) ok",[item.id,lease])).rows[0].ok).toBe(true);
    await db.query("select public.scheduler_finish_item($1,$2,'accepted')",[item.id,lease]);
    expect((await db.query("select template_id,content_key,content_label,subject,final_html_body,status from public.email_history")).rows[0]).toMatchObject({template_id:null,content_key:"spreadsheet:"+dataset,content_label:expect.stringContaining("Spreadsheet body"),subject:"Frozen sheet subject",final_html_body:"<p>Frozen sheet body</p>",status:"sent"});
    await expect(bodySchedule()).rejects.toThrow(/duplicate/);
  });
  it("blocks same-campaign duplicates within a batch even though template IDs are null", async () => {
    await source();
    const item={row_id:row,recipient_email:"reader@example.com",template_id:null,content_key:"spreadsheet:"+dataset,template_name:"Spreadsheet body",subject:"Subject",html_body:"<p>Body</p>",plain_text_body:"Body"};
    const otherRow=crypto.randomUUID();
    await db.query("insert into public.dataset_rows(id,user_id,dataset_id,row_number,recipient_email,email_normalized,email_valid) values($1,$2,$3,3,'reader@example.com','reader@example.com',true)",[otherRow,owner,dataset]);
    const repeated={...item,row_id:otherRow};
    await expect(bodySchedule([item,repeated])).rejects.toThrow(/duplicate/);
    expect((await db.query("select * from public.scheduled_mail_batches")).rows).toHaveLength(0);
    await bodySchedule([item,repeated],"allow",false);
    expect((await db.query("select * from public.scheduled_mail_items")).rows).toHaveLength(2);
  });
  it("protects spreadsheet reservations from an immediate browser send and exposes them to readiness", async () => {
    await source(); await bodySchedule();
    await asOwner();
    const p=(await db.query<{p:{scheduled:{content_key:string}[]}}>("select public.send_recipient_protection(array['reader@example.com']) p")).rows[0].p;
    expect(p.scheduled[0].content_key).toBe("spreadsheet:"+dataset);
    const r=crypto.randomUUID(), i=crypto.randomUUID();
    await db.query("insert into public.send_runs(id,user_id,dataset_id,status,live_enabled) values($1,$2,$3,'paused',true)",[r,owner,dataset]);
    await db.query("insert into public.send_run_items(id,user_id,send_run_id,dataset_row_id,recipient_email,resolved_subject,resolved_html_body) values($1,$2,$3,$4,'reader@example.com','Subject','<p>Body</p>')",[i,owner,r,row]);
    await expect(db.query("select public.claim_send_run_item($1,0)",[i])).rejects.toThrow(/reserved/);
  });
  it("does not allow a request to schedule stale template IDs in spreadsheet mode", async () => {
    await source();
    await expect(create()).rejects.toThrow(/source changed/);
    expect((await db.query("select * from public.scheduled_mail_batches")).rows).toHaveLength(0);
  });
  it("prepares an engagement link for a template-free scheduled email and creates a safe fresh-content follow-up", async () => {
    await source();
    const items=[{row_id:row,recipient_email:"reader@example.com",template_id:null,content_key:"spreadsheet:"+dataset,template_name:"Spreadsheet body",subject:"Subject",html_body:'<p>Body</p><a href="'+ENGAGEMENT_PREVIEW_URL+'">Visit</a>',plain_text_body:"Visit "+ENGAGEMENT_PREVIEW_URL,engagement_snapshot:{...defaultEngagement,enabled:true,destination:"https://example.com",origin:"https://autmail.vercel.app"}}];
    const id=await bodySchedule(items); await due(id); const lease=await start(); const item=await itemFor(id);
    await db.query("select public.scheduler_arm_item($1,$2,true)",[item.id,lease]);
    const sendItem=(await db.query<{send_run_item_id:string}>("select send_run_item_id from public.scheduled_mail_items where id=$1",[item.id])).rows[0].send_run_item_id;
    const prepared=(await db.query<{p:{htmlBody:string}}>("select public.engagement_prepare_send($1,'https://autmail.vercel.app') p",[sendItem])).rows[0].p;
    expect(prepared.htmlBody).toMatch(/\/e\/[a-f0-9]{64}/);
    expect((await db.query("select template_name,status from public.email_engagement_messages where send_run_item_id=$1",[sendItem])).rows[0]).toMatchObject({template_name:expect.stringContaining("Spreadsheet body"),status:"pending"});
    await db.query("select public.scheduler_finish_item($1,$2,'accepted')",[item.id,lease]);
    const message=(await db.query<{id:string;status:string}>("select id,status from public.email_engagement_messages where send_run_item_id=$1",[sendItem])).rows[0];
    expect(message.status).toBe("accepted");
    const followup=(await db.query<{p:{id:string}}>("select public.engagement_create_followup($1,array[$2::uuid],'Follow-up',$3) p",[owner,message.id,crypto.randomUUID()])).rows[0].p;
    expect((await db.query("select body_source,body_column_id,fallback_template_id from public.datasets where id=$1",[followup.id])).rows[0]).toMatchObject({body_source:"template",body_column_id:null,fallback_template_id:null});
    expect((await db.query<{data:{message:string}}>("select data from public.dataset_rows where dataset_id=$1",[followup.id])).rows[0].data.message).toBe("Sheet body");
    expect((await db.query("select * from public.send_runs where dataset_id=$1",[followup.id])).rows).toHaveLength(0);
  });
  it("copies spreadsheet body data into a history follow-up without implicitly resending the previous message", async () => {
    await source(); const id=await bodySchedule(); await due(id); const lease=await start(); const item=await itemFor(id);
    await db.query("select public.scheduler_arm_item($1,$2)",[item.id,lease]); await db.query("select public.scheduler_finish_item($1,$2,'accepted')",[item.id,lease]);
    const history=(await db.query<{id:string}>("select id from public.email_history")).rows[0];
    const followup=(await db.query<{p:{id:string}}>("select public.history_create_followup($1,array[$2::uuid],'History follow-up',$3) p",[owner,history.id,crypto.randomUUID()])).rows[0].p;
    const copied=(await db.query<{data:{message:string}}> ("select data from public.dataset_rows where dataset_id=$1",[followup.id])).rows[0];
    expect(copied.data.message).toBe("Sheet body");
    expect((await db.query("select body_source,fallback_template_id from public.datasets where id=$1",[followup.id])).rows[0]).toMatchObject({body_source:"template",fallback_template_id:null});
    expect((await db.query("select * from public.send_runs where dataset_id=$1",[followup.id])).rows).toHaveLength(0);
  });

});
