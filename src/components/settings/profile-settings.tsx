"use client";

import { useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Profile } from "@/types";
import { PasswordSettings } from "./password-settings";

export function ProfileSettings({ profile }: { profile: Partial<Profile> }) {
  const [pending, setPending] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in again to save settings.");
      const { error } = await supabase.from("profiles").upsert({
        id: user.id,
        full_name: String(values.full_name ?? "").trim(),
        email: String(values.profile_email ?? "").trim() || null,
      });
      if (error) throw error;
      toast.success("Account details saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save account details.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6"><form onSubmit={save}>
      <Card id="account">
        <CardHeader className="px-6 py-5 sm:px-8">
          <CardTitle>Workspace account details</CardTitle>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">These details identify you inside the workspace. Recipients see the mailbox connected in the Email account tab.</p>
        </CardHeader>
        <CardContent className="p-6 sm:p-8">
          <div className="space-y-6">
            <Field label="Full name" name="full_name" defaultValue={profile.full_name} required />
            <Field label="Contact email" name="profile_email" type="email" defaultValue={profile.email} />
          </div>
          <p className="mt-3 text-xs text-[var(--muted-foreground)]">Changing this contact email does not change the email you use to sign in.</p>
          <div className="mt-5 flex justify-end">
            <Button type="submit" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" size={15} /> : <Save size={15} />}Save account</Button>
          </div>
        </CardContent>
      </Card>
    </form><PasswordSettings /></div>
  );
}

function Field({ label, name, defaultValue, ...props }: { label: string; name: string; defaultValue?: string | null } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "defaultValue" | "name">) {
  return <div><Label htmlFor={name}>{label}</Label><Input id={name} name={name} defaultValue={defaultValue ?? ""} {...props} /></div>;
}
