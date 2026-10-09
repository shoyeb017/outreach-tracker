import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({ fetch:vi.fn(), push:vi.fn(), refresh:vi.fn() }));
vi.mock("next/navigation",()=>({useRouter:()=>({push:mocks.push,refresh:mocks.refresh})}));
import { AccountActions } from "@/components/admin/account-actions";
const props={id:"22222222-2222-4222-8222-222222222222",email:"user@example.com",protectedAccount:false,connected:true,cleanup:false,available:true};
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal("fetch",mocks.fetch);mocks.fetch.mockResolvedValue(Response.json({ok:true}));HTMLDialogElement.prototype.showModal=function(){this.setAttribute("open","");};HTMLDialogElement.prototype.close=function(){this.removeAttribute("open");};});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe("explicit administrator account actions",()=>{
  it("protects administrator accounts and disables unavailable actions",()=>{const view=render(<AccountActions {...props} protectedAccount />);expect(screen.queryByRole("button")).not.toBeInTheDocument();expect(screen.getByText(/Administrator account protected/)).toBeVisible();view.rerender(<AccountActions {...props} available={false}/>);expect(screen.getByRole("alert")).toHaveTextContent("migration");expect(screen.queryByRole("button")).not.toBeInTheDocument();});
  it("requires typed email AND acknowledgement before submitting irreversible deletion",async()=>{
    render(<AccountActions {...props}/>);fireEvent.click(screen.getByRole("button",{name:"Delete account"}));
    const submit=screen.getByRole("button",{name:"Permanently delete account"});expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Type the account email to confirm"),{target:{value:"user@example.com"}});expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));expect(submit).toBeEnabled();fireEvent.click(submit);
    await waitFor(()=>expect(mocks.push).toHaveBeenCalledWith("/admin/users?deleted=1"));
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({action:"delete",confirmation:"user@example.com",acknowledged:true});
  });
  it("keeps the dialog open, blocks dismissal during cleanup, and reports failures",async()=>{
    let complete!:(value:Response)=>void;mocks.fetch.mockReturnValue(new Promise<Response>(resolve=>{complete=resolve;}));
    render(<AccountActions {...props}/>);fireEvent.click(screen.getByRole("button",{name:"Delete account"}));fireEvent.change(screen.getByLabelText("Type the account email to confirm"),{target:{value:props.email}});fireEvent.click(screen.getByRole("checkbox"));fireEvent.click(screen.getByRole("button",{name:"Permanently delete account"}));
    expect(screen.getByRole("button",{name:"Cancel"})).toBeDisabled();expect(screen.getByRole("button",{name:/Close Permanently/})).toBeDisabled();
    complete(Response.json({error:"Storage cleanup needs retry"},{status:400}));await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("Storage cleanup needs retry"));expect(screen.getByRole("dialog")).toBeVisible();expect(mocks.push).not.toHaveBeenCalled();
  });
  it("disconnects only after confirmation and explains reconnection",async()=>{render(<AccountActions {...props}/>);fireEvent.click(screen.getByRole("button",{name:"Disconnect sender"}));expect(mocks.fetch).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"Confirm disconnect"}));await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent("user must reconnect"));expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({action:"disconnect"});});
  it("offers cleanup retry without allowing sender changes on a locked workspace",()=>{render(<AccountActions {...props} cleanup/>);expect(screen.getByRole("button",{name:"Retry account cleanup"})).toBeEnabled();expect(screen.getByRole("button",{name:"Disconnect sender"})).toBeDisabled();});
});
