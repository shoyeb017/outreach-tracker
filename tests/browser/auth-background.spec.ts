import { expect, test } from "@playwright/test";

for (const theme of ["light","dark"]) for (const width of [360,768,1280]) {
  test(`auth background and back navigation: ${theme}, ${width}px`,async({page},info)=>{
    const errors:string[]=[]; page.on("pageerror",error=>errors.push(error.message));
    await page.setViewportSize({width,height:900});
    await page.addInitScript(theme=>localStorage.setItem("outreach-theme",theme),theme);
    for (const [route,heading] of [["/login","Welcome back"],["/register","Create your account"],["/forgot-password","Reset your password"]]) {
      await page.goto(route);await expect(page.getByRole("heading",{level:1,name:heading,exact:true})).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme",theme);
      await expect(page.locator(".blue-tubes-layer")).toHaveAttribute("data-animation-state",/running|fallback/);
      await expect(page.getByRole("link",{name:"Back to home",exact:true})).toHaveAttribute("href","/");
      expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1)).toBe(true);
      if(route==="/forgot-password"){await page.getByRole("link",{name:"Back to sign in",exact:true}).click();await expect(page).toHaveURL(/\/login$/);}
      if(route==="/login" && width!==768)await page.screenshot({path:info.outputPath(`auth-${theme}-${width}.png`),fullPage:true});
    }
    await page.getByRole("link",{name:"Back to home",exact:true}).click();await expect(page).toHaveURL(/\/$/);expect(errors).toEqual([]);
  });
}
test("reduced motion and enlarged text keep recovery navigation usable",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});await page.setViewportSize({width:360,height:900});await page.goto("/forgot-password");
  await expect(page.locator(".blue-tubes-layer")).toHaveAttribute("data-animation-state","reduced");await page.addStyleTag({content:"html { font-size: 200%; }"});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1)).toBe(true);await expect(page.getByRole("link",{name:"Back to sign in",exact:true})).toBeVisible();
});
