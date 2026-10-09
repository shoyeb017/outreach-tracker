import { describe, expect, it } from "vitest";
import { audiences, authorityAllowed, configurationInput, normalizeConfiguration, PERSONAL_MICROSOFT_TENANT, resolveAuthority } from "@/lib/microsoft/authority";
import { sameOrigin } from "@/lib/admin/security";
const tenant="11111111-1111-4111-8111-111111111111";
describe("Microsoft authority selection",()=>{
  it("permits an explicitly personal-only registration without inventing a company tenant",()=>{const parsed=configurationInput.parse({client_id:tenant,tenant_id:"",fallback_audience:"PersonalMicrosoftAccount"});expect(normalizeConfiguration(parsed).tenant_id).toBe(PERSONAL_MICROSOFT_TENANT);expect(configurationInput.safeParse({client_id:tenant,tenant_id:"",fallback_audience:"AzureADMyOrg"}).success).toBe(false);});
  it.each(audiences)("resolves %s to an approved Microsoft authority",(audience)=>{const suffix={AzureADMyOrg:tenant,AzureADMultipleOrgs:"organizations",AzureADandPersonalMicrosoftAccount:"common",PersonalMicrosoftAccount:"consumers"}[audience];expect(resolveAuthority(tenant,audience)).toBe(`https://login.microsoftonline.com/${suffix}`);});
  it("rejects arbitrary hosts, paths, and invalid identifiers",()=>{expect(()=>resolveAuthority("../common","AzureADMyOrg")).toThrow();expect(authorityAllowed("https://evil.example/common")).toBe(false);expect(authorityAllowed("https://login.microsoftonline.com/common/extra")).toBe(false);expect(configurationInput.safeParse({client_id:"wrong",tenant_id:tenant}).success).toBe(false);});
});
describe("administrator safeguards",()=>{
  it("requires the exact configured Origin for mutation requests",()=>{expect(sameOrigin(new Request("https://app.example/api",{headers:{Origin:"https://evil.example"}}),"https://app.example")).toBe(false);expect(sameOrigin(new Request("https://app.example/api"),"https://app.example")).toBe(false);expect(sameOrigin(new Request("https://app.example/api",{headers:{Origin:"https://app.example"}}),"https://app.example")).toBe(true);});
});
