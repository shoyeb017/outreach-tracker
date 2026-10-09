import { expect, test } from "@playwright/test";

test("admin pages and APIs deny unauthenticated access",async({page,request})=>{
  await page.goto("/admin");await expect(page).toHaveURL(/\/login\?next=\/admin$/);await expect(page.getByRole("heading",{name:"Welcome back"})).toBeVisible();
  const response=await request.post("/api/admin/microsoft",{headers:{Origin:"http://127.0.0.1:3107"},data:{enabled:true}});expect(response.status()).toBe(403);
  for(const route of ["/admin/users","/admin/security","/admin/microsoft-settings"]){await page.goto(route);await expect(page).toHaveURL(/\/login\?next=\/admin$/);}
});
test("help and administrator login fit all supported widths",async({page},info)=>{
  test.setTimeout(120000);
  const errors:string[]=[];page.on("pageerror",(error)=>errors.push(error.message));
  for(const width of [360,390,768,1024,1280,1536]){
    await page.setViewportSize({width,height:900});
    for(const route of ["/admin/login","/help","/help/microsoft-setup","/help/default-connection","/help/custom-connection","/help/permissions","/help/troubleshooting"]){
      await page.goto(route);await expect(page.getByRole("heading",{level:1})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`${route} at ${width}`).toBe(true);
      if(width===390 && route==="/help/microsoft-setup")await page.screenshot({path:info.outputPath("microsoft-guide-390.png"),fullPage:true});
    }
  }
  expect(errors).toEqual([]);
});
test("help search and troubleshooting have useful keyboard-accessible details",async({page})=>{
  await page.goto("/help");await page.getByLabel("Find a guide").fill("permissions");await expect(page.getByRole("navigation",{name:"Help center"}).getByRole("link",{name:"Permissions explained",exact:true})).toBeVisible();
  await page.goto("/help/troubleshooting");await page.getByText("AADSTS50020 / wrong tenant",{exact:true}).click();await expect(page.getByText("What happened",{exact:true}).first()).toBeVisible();await expect(page.getByRole("button",{name:"Copy redirect URL"})).toBeVisible();
});

test("public help returns to the landing page and workspace navigation exposes it", async ({ page }) => {
  await page.goto("/help/default-connection");
  await page.getByRole("banner").getByRole("link", { name: "Back to landing page", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Your spreadsheet.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Landing page" }).click();
  await expect(page).toHaveURL("/");
});
