import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({initialize:vi.fn(),construct:vi.fn(),byId:vi.fn(),silent:vi.fn(),popup:vi.fn(),login:vi.fn(),active:vi.fn(),clear:vi.fn()}));
vi.mock("@azure/msal-browser",()=>({BrowserCacheLocation:{SessionStorage:"sessionStorage"},InteractionRequiredAuthError:class extends Error{},PublicClientApplication:class {constructor(configuration:unknown){mocks.construct(configuration);}initialize=mocks.initialize;getAccountByHomeId=mocks.byId;acquireTokenSilent=mocks.silent;acquireTokenPopup=mocks.popup;loginPopup=mocks.login;setActiveAccount=mocks.active;clearCache=mocks.clear;}}));
import { acquireGraphToken, clearWorkspaceMicrosoftSessions, connectMicrosoft, getMsalApplication } from "@/lib/microsoft/msal";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
const account={username:"selected@example.com",homeAccountId:"explicit-account"};
function response(authority="https://login.microsoftonline.com/common",home="explicit-account"){return Response.json({configuration:{id:authority,client_id:"client",tenant_id:"tenant",authority,home_account_id:home}});}
beforeEach(()=>{vi.clearAllMocks();mocks.initialize.mockResolvedValue(undefined);mocks.byId.mockReturnValue(account);mocks.silent.mockResolvedValue({accessToken:"selected-token",account,scopes:["User.Read","Mail.Send"]});vi.stubGlobal("fetch",vi.fn().mockImplementation(()=>Promise.resolve(response())));});
afterEach(()=>vi.unstubAllGlobals());
describe("explicit MSAL account selection",()=>{
  it("accepts Mail.Read without requesting sending or writing permission", async () => {
    mocks.silent.mockResolvedValueOnce({ accessToken: "read-token", account, scopes: ["User.Read", "Mail.Read"] });
    expect((await acquireGraphToken("tenant", "client", false, { scopes: ["User.Read", "Mail.Read"], interactive: false })).token).toBe("read-token");
    expect(mocks.silent).toHaveBeenCalledWith({ scopes: ["User.Read", "Mail.Read"], account });
  });
  it("accepts existing ReadWrite consent for a read-only action", async () => {
    mocks.silent.mockResolvedValueOnce({ accessToken: "read-token", account, scopes: ["User.Read", "Mail.ReadWrite"] });
    await expect(acquireGraphToken("tenant", "client", false, { scopes: ["User.Read", "Mail.Read"], interactive: false })).resolves.toHaveProperty("token", "read-token");
  });
  it("does not treat ReadWrite as permission to send", async () => {
    mocks.silent.mockResolvedValueOnce({ accessToken: "write-token", account, scopes: ["User.Read", "Mail.ReadWrite"] });
    await expect(acquireGraphToken("tenant", "client", false, { scopes: ["User.Read", "Mail.Send"], interactive: true })).rejects.toThrow("Mail.Send");
  });
  it("explains administrator consent errors from interactive reading", async () => {
    mocks.silent.mockRejectedValueOnce(new InteractionRequiredAuthError("interaction_required"));
    mocks.popup.mockRejectedValueOnce(new Error("AADSTS90094: admin consent required"));
    await expect(acquireGraphToken("tenant", "client", false, { scopes: ["User.Read", "Mail.Read"], interactive: true })).rejects.toThrow("even to your own mailbox");
  });
  it("does not launch consent popups on automatic mailbox loading", async () => {
    mocks.silent.mockRejectedValueOnce(new InteractionRequiredAuthError("interaction_required"));
    await expect(acquireGraphToken("tenant", "client", false, { scopes: ["User.Read", "Mail.ReadWrite", "Mail.Send"], interactive: false })).rejects.toThrow("Enable mailbox access");
    expect(mocks.popup).not.toHaveBeenCalled();
  });
  it("rejects missing mailbox consent even if a token is returned", async () => {
    await expect(acquireGraphToken("tenant", "client", false, { scopes: ["User.Read", "Mail.ReadWrite", "Mail.Send"], interactive: false })).rejects.toThrow("Mail.ReadWrite");
  });
  it("accepts fully qualified Graph scopes for the selected mailbox", async () => {
    mocks.silent.mockResolvedValueOnce({ accessToken: "mailbox-token", account, scopes: ["https://graph.microsoft.com/User.Read", "Mail.ReadWrite", "Mail.Send"] });
    expect((await acquireGraphToken("tenant", "client", false, { scopes: ["User.Read", "Mail.ReadWrite", "Mail.Send"], interactive: false })).token).toBe("mailbox-token");
  });
  it("uses the saved home-account ID instead of an arbitrary cached account",async()=>{expect(await acquireGraphToken("tenant","client")).toEqual({token:"selected-token",account});expect(mocks.byId).toHaveBeenCalledWith("explicit-account");expect(mocks.silent).toHaveBeenCalledWith(expect.objectContaining({account}));});
  it("requires explicit reconnect when no sender is saved",async()=>{vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response(undefined,"")));await expect(acquireGraphToken("tenant","client")).rejects.toThrow("Reconnect");expect(mocks.silent).not.toHaveBeenCalled();});
  it("rejects a changed account returned by interactive renewal",async()=>{mocks.silent.mockRejectedValue(new InteractionRequiredAuthError());mocks.popup.mockResolvedValue({accessToken:"wrong-token",account:{...account,homeAccountId:"different"},scopes:["Mail.Send"]});await expect(acquireGraphToken("tenant","client")).rejects.toThrow("account changed");});
  it("does not turn every silent failure into an interactive popup",async()=>{mocks.silent.mockRejectedValue(new Error("network unavailable"));await expect(acquireGraphToken("tenant","client")).rejects.toThrow("network unavailable");expect(mocks.popup).not.toHaveBeenCalled();});
  it("rejects tokens without delegated Mail.Send",async()=>{mocks.silent.mockResolvedValue({accessToken:"no-send-token",account,scopes:["User.Read"]});await expect(acquireGraphToken("tenant","client")).rejects.toThrow("Mail.Send");});
  it("can check basic Graph authentication independently of sending consent",async()=>{mocks.silent.mockResolvedValue({accessToken:"profile-token",account,scopes:["User.Read"]});expect((await acquireGraphToken("tenant","client",false)).grantedScopes).toEqual(["User.Read"]);expect(mocks.silent).toHaveBeenCalledWith({scopes:["User.Read"],account});});
  it("reinitializes when authority changes and deduplicates initialization",async()=>{vi.stubGlobal("fetch",vi.fn().mockImplementation(()=>Promise.resolve(response("https://login.microsoftonline.com/organizations"))));await Promise.all([getMsalApplication("tenant","client"),getMsalApplication("tenant","client")]);expect(mocks.construct).toHaveBeenCalledTimes(1);vi.stubGlobal("fetch",vi.fn().mockImplementation(()=>Promise.resolve(response("https://login.microsoftonline.com/consumers"))));await getMsalApplication("tenant","client");expect(mocks.construct).toHaveBeenCalledTimes(2);});
  it("rejects arbitrary authentication hosts before MSAL initialization",async()=>{vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response("https://evil.example/common")));await expect(getMsalApplication("tenant","client")).rejects.toThrow("Unsafe");expect(mocks.construct).not.toHaveBeenCalled();});
  it("clears initialized and known registration caches on workspace logout",async()=>{const id="22222222-2222-4222-8222-222222222222";await clearWorkspaceMicrosoftSessions([id,id,"invalid"]);expect(mocks.clear).toHaveBeenCalled();expect(mocks.construct).toHaveBeenCalledTimes(1);expect(mocks.construct).toHaveBeenCalledWith(expect.objectContaining({auth:expect.objectContaining({clientId:id})}));});
});

describe("automatic sign-in without directory metadata",()=>{
  const configuration={id:"55555555-5555-4555-8555-555555555555",client_id:"66666666-6666-4666-8666-666666666666",tenant_id:"77777777-7777-4777-8777-777777777777",method:"default",verification:"unverified",audience:null,authority:"https://login.microsoftonline.com/common"};
  const tenantAuthority=`https://login.microsoftonline.com/${configuration.tenant_id}`;
  function setup(){vi.stubGlobal("fetch",vi.fn().mockImplementation(async(_url,options)=>{const body=options?.body?JSON.parse(options.body):null;return Response.json(body?.action==="connect"?{ok:true}:{configuration:body?.signInEndpoint==="tenant"?{...configuration,authority:tenantAuthority}:configuration});}));mocks.login.mockReset();}
  it("retries only an explicit single-tenant endpoint error and saves the same selected sender",async()=>{setup();mocks.login.mockRejectedValueOnce(new Error("AADSTS50194: /common is not supported"));mocks.login.mockResolvedValueOnce({accessToken:"selected-token",account,scopes:["User.Read","Mail.Send"]});expect(await connectMicrosoft(configuration.tenant_id,configuration.client_id)).toEqual(account);expect(mocks.login).toHaveBeenCalledTimes(2);expect(fetch).toHaveBeenCalledWith("/api/microsoft/configuration",expect.objectContaining({body:JSON.stringify({action:"select",method:"default",id:configuration.id,signInEndpoint:"tenant"})}));expect(mocks.construct).toHaveBeenCalledWith(expect.objectContaining({auth:expect.objectContaining({authority:tenantAuthority})}));const writes=vi.mocked(fetch).mock.calls.map(([,options])=>options?.body?JSON.parse(String(options.body)):null);expect(writes).toContainEqual(expect.objectContaining({action:"connect",homeAccountId:account.homeAccountId,authority:tenantAuthority}));});
  it("does not retry arbitrary account mismatch or consent errors",async()=>{setup();mocks.login.mockRejectedValue(new Error("AADSTS50020: wrong account"));await expect(connectMicrosoft(configuration.tenant_id,configuration.client_id)).rejects.toThrow();expect(mocks.login).toHaveBeenCalledTimes(1);expect(vi.mocked(fetch).mock.calls.some(([,options])=>options?.method==="POST")).toBe(false);});
  it("bounds the single-tenant retry to one attempt",async()=>{setup();mocks.login.mockRejectedValue(new Error("AADSTS50194"));await expect(connectMicrosoft(configuration.tenant_id,configuration.client_id)).rejects.toThrow();expect(mocks.login).toHaveBeenCalledTimes(2);});
  it("never retries an explicitly configured authority as guessed metadata",async()=>{setup();vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({configuration:{...configuration,verification:"manual"}})));mocks.login.mockRejectedValue(new Error("AADSTS50194"));await expect(connectMicrosoft(configuration.tenant_id,configuration.client_id)).rejects.toThrow();expect(mocks.login).toHaveBeenCalledTimes(1);});
});
