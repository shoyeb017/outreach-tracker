import { expect, test } from "@playwright/test";
import { defaultEngagement } from "../../src/lib/engagement/core";
test("engagement settings and follow-up activity work responsively in both themes without sending", async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = [], requests: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const id="11111111-1111-4111-8111-111111111111", source="22222222-2222-4222-8222-222222222222";
  const message={id,dataset_id:source,campaign_id:id,dataset_name:"Accounting contacts — a long spreadsheet name to check responsive wrapping",template_name:"Accounting firm Outreach with a longer descriptive name",recipient_email:"an-intentionally-long-recipient-address-for-responsive-layout@example.com",subject:"A tailored introduction for a company with a longer display name",destination:"https://example.com/services",status:"accepted",accepted_at:"2026-10-19T10:00:00Z",first_activity_at:"2026-10-19T10:01:00Z",last_activity_at:"2026-10-19T10:02:00Z",activity_count:2,suspected_count:1,last_suspected_at:"2026-10-19T10:00:01Z",created_at:"2026-10-19T10:00:00Z",expires_at:"2027-01-17T10:00:00Z"};
  await page.route("**/api/engagement**",async route=>{
    requests.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    const path=new URL(route.request().url()).pathname;
    if(path==="/api/engagement/settings") return route.fulfill({json:{settings:{...defaultEngagement,enabled:true,destination:"https://example.com/services",button_text:"Explore our services"}}});
    if(route.request().method()==="POST") return route.fulfill({json:{id:source,added:1,omitted:0}});
    return route.fulfill({json:{messages:[message],page:1,total:1,sources:[{id:source,name:message.dataset_name}],campaigns:[{id,dataset_id:source,name:message.dataset_name,created_at:message.created_at}]}});
  });
  await page.route("https://graph.microsoft.com/**",route=>{errors.push("Unexpected Microsoft request");return route.abort();});
  async function applyTheme(theme: "light" | "dark") {
    const desired=page.getByRole("button",{name:`Switch to ${theme} mode`});
    if(await desired.isVisible()) await desired.click();
    else { await page.getByRole("button",{name:`Switch to ${theme === "dark" ? "light" : "dark"} mode`}).click(); await desired.click(); }
    await expect(page.locator("html")).toHaveAttribute("data-theme",theme);
  }
  for(const theme of ["light","dark"] as const) for(const width of [360,768,1280]) {
    await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme:theme,reducedMotion:"reduce"});
    await page.goto("/engagement-settings");
    await applyTheme(theme);
    await expect(page.getByLabel("Website to open")).toHaveValue("https://example.com/services");
    await expect(page.getByRole("link",{name:"Explore our services"})).toHaveAttribute("href","#engagement-preview");
    await page.getByRole("link",{name:"Explore our services"}).click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    if(width!==768) await page.screenshot({path:info.outputPath(`engagement-settings-${theme}-${width}.png`),fullPage:true});
    await page.goto("/engagement");await applyTheme(theme);await expect(page.getByText(message.recipient_email,{exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await expect(page.getByRole("button",{name:"Create follow-up spreadsheet"})).toBeDisabled();
    await page.getByLabel("Source spreadsheet").selectOption(source);await page.getByRole("checkbox").check();
    await page.getByRole("button",{name:"Create follow-up spreadsheet"}).click();
    const dialog=page.getByRole("dialog",{name:"Create a follow-up spreadsheet"});
    await expect(dialog.getByRole("button",{name:"Create spreadsheet"})).toBeDisabled();
    expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
    await dialog.getByRole("checkbox").check();await expect(dialog.getByRole("button",{name:"Create spreadsheet"})).toBeEnabled();
    if(width!==768) await page.screenshot({path:info.outputPath(`engagement-followup-${theme}-${width}.png`),fullPage:true});
    await dialog.getByRole("button",{name:"Cancel",exact:true}).click();
  }
  expect(requests.some(request=>request.includes("/prepare"))).toBe(false);
  expect(requests.some(request=>request.startsWith("POST"))).toBe(false);
  expect(errors).toEqual([]);
});
