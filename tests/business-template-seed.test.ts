// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractPlaceholders, htmlToPlainText, resolvePlaceholders, buildTemplateContext } from "@/lib/templates/placeholders";
import { suggestTemplate } from "@/lib/templates/routing";
import type { EmailTemplate } from "@/types";

const seed=readFileSync("supabase/migrations/20261016_business_outreach_templates.sql","utf8");
const categories=["Marketing agency","Digital marketing agency","IT company","IT consulting company","Software company","Business consulting","Management consulting","Accounting firm","Bookkeeping service","Recruitment agency","Construction company","General contractor","Real estate agency","Property management company","Landscaping company"];
let db:PGlite; let originals:unknown[];
async function businessTemplates() { return (await db.query<EmailTemplate & {seed_key:string; user_id:string|null}>("select * from public.templates where seed_key like 'business-%' order by category")).rows; }

beforeAll(async()=>{
  db=new PGlite({extensions:{pgcrypto}});
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'service_role')$$;
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
    grant usage on schema public,auth to authenticated,anon,service_role;`);
  await db.exec(readFileSync("supabase/schema.sql","utf8"));
  await db.exec("grant select,insert,update,delete on all tables in schema public to authenticated;");
  await db.exec(readFileSync("supabase/seed_templates.sql","utf8"));
  originals=(await db.query("select * from public.templates order by seed_key")).rows;
  await db.exec(seed);
},60000);
afterAll(async()=>{await db?.close();});

describe("15 location-independent business outreach templates",()=>{
  it("adds exactly the requested business categories and keeps the 24 original ready-made templates intact",async()=>{
    const templates=await businessTemplates(); expect(templates).toHaveLength(15);
    expect(templates.map(row=>row.category).sort()).toEqual([...categories].sort());
    expect(templates.map(row=>row.name).sort()).toEqual(categories.map(category=>`${category} Outreach`).sort());
    expect((await db.query("select * from public.templates where seed_key not like 'business-%' order by seed_key")).rows).toEqual(originals);
    expect((await db.query("select * from public.templates")).rows).toHaveLength(39);
  });
  it("uses the existing simple format, four specific services and only company/signature placeholders",async()=>{
    const templates=await businessTemplates();
    for(const template of templates){
      expect(template).toMatchObject({user_id:null,is_system:true,is_active:true,is_archived:false,signature_behavior:"token_only"});
      expect(template.html_body).toContain("<p>Hi {{company_name}},</p>");
      expect(template.html_body).toContain("At Inuberry Global, we help");
      expect(template.html_body.match(/<li>/g)).toHaveLength(4);
      expect(template.html_body).toContain("15-minute introductory call");
      expect(template.html_body).toContain("<p>Best regards,</p>");
      expect(template.plain_text_body?.match(/^- /gm)).toHaveLength(4);
      expect(extractPlaceholders([template.subject_template,template.html_body,template.plain_text_body].join("\n")).sort()).toEqual(["company_name","signature"]);
      expect([template.name,template.category,template.subject_template,template.html_body,template.plain_text_body].join("\n")).not.toMatch(/Arlington|Alexandria|Fairfax|Reston|Ashburn|Richmond|Virginia|Day \d|{{(?:city|location|state)}}/i);
      expect(htmlToPlainText(template.html_body).replace(/\s+/g," ").trim()).toBe(template.plain_text_body?.replace(/^- /gm,"").replace(/\s+/g," ").trim());
      const context=buildTemplateContext({rowData:{company_name:"Sample Landscaping"},signatureHtml:"<p>Sample Sender</p>"});
      const rendered=resolvePlaceholders(template.html_body,context,true); expect(rendered.missing).toEqual([]); expect(rendered.output).toContain("Sample Landscaping");
    }
    expect(new Set(templates.map(row=>row.html_body)).size).toBe(15);
  });
  it("supports exact business-type routing without making the existing broad industry matches ambiguous",async()=>{
    const all=(await db.query<EmailTemplate>("select * from public.templates")).rows;
    for(const category of categories) expect(suggestTemplate(`  ${category.toUpperCase()}  `,all)?.name).toBe(`${category} Outreach`);
    expect(suggestTemplate("Marketing & Advertising",all)?.name).toBe("Marketing & Advertising Outreach");
    expect(suggestTemplate("Technology & Software",all)?.name).toBe("Technology & Software Outreach");
    expect(suggestTemplate("Marketing agency Arlington, Virginia",all)).toBeNull();
  });
  it("can be rerun with stable IDs, no duplicates, and no changes to personal copies",async()=>{
    const owner="11111111-1111-4111-8111-111111111111";
    try{
      const before=await businessTemplates();
      await db.query("insert into auth.users(id,email) values($1,'owner@example.com')",[owner]);
      await db.query("insert into public.templates(user_id,name,category,subject_template,html_body) values($1,'Landscaping company Outreach','Landscaping company','Personal subject','<p>My own copy</p>')",[owner]);
      await db.exec(seed);
      expect((await businessTemplates()).map(row=>row.id)).toEqual(before.map(row=>row.id));
      expect((await db.query<{subject_template:string;html_body:string}>("select subject_template,html_body from public.templates where user_id=$1",[owner])).rows[0]).toMatchObject({subject_template:"Personal subject",html_body:"<p>My own copy</p>"});
      expect((await businessTemplates())).toHaveLength(15);
    }finally{await db.query("delete from auth.users where id=$1",[owner]);}
  });
  it("leaves the new system templates read-only for ordinary users",async()=>{
    const owner="22222222-2222-4222-8222-222222222222";
    await db.query("insert into auth.users(id,email) values($1,'reader@example.com')",[owner]);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false); select set_config('request.jwt.claim.role','authenticated',false);`);
    try{
      expect((await businessTemplates())).toHaveLength(15);
      expect((await db.query("update public.templates set name='Changed' where seed_key='business-landscaping-company' returning id")).rows).toHaveLength(0);
      expect((await db.query("delete from public.templates where seed_key='business-landscaping-company' returning id")).rows).toHaveLength(0);
    }finally{await db.exec("reset role");}
  });
});
