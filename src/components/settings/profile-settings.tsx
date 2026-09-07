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
    <form onSubmit={save}>
      <Card id="account">
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <p className="mt-1 text-sm text-[#68736f]">Your private workspace identity. Email recipients see the Microsoft 365 account connected below.</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Full name" name="full_name" defaultValue={profile.full_name} required />
            <Field label="Account email" name="profile_email" type="email" defaultValue={profile.email} />
          </div>
          <div className="mt-5 flex justify-end">
            <Button type="submit" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" size={15} /> : <Save size={15} />}Save account</Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

function Field({ label, name, defaultValue, ...props }: { label: string; name: string; defaultValue?: string | null } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "defaultValue" | "name">) {
  return <div><Label htmlFor={name}>{label}</Label><Input id={name} name={name} defaultValue={defaultValue ?? ""} {...props} /></div>;
}
