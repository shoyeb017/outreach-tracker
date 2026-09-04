"use client";

import { useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Profile, SenderProfile } from "@/types";

export function ProfileSettings({ profile, sender }: { profile: Partial<Profile>; sender: Partial<SenderProfile> }) {
  const [pending, setPending] = useState(false);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); const values = Object.fromEntries(new FormData(event.currentTarget));
    try { const supabase = getSupabaseBrowserClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new Error("Sign in again to save settings.");
      const { error: profileError } = await supabase.from("profiles").upsert({ id: user.id, full_name: values.full_name, email: values.profile_email || null, timezone: values.timezone || "UTC", location: values.profile_location || null }); if (profileError) throw profileError;
      const { error: senderError } = await supabase.from("sender_profiles").upsert({ user_id: user.id, sender_name: values.sender_name, designation: values.designation || null, organization: values.organization || null, company_phone: values.company_phone || null, mobile: values.mobile || null, sender_email: values.sender_email || null, location: values.sender_location || null, company_address: values.company_address || null, website: values.website || null }, { onConflict: "user_id" }); if (senderError) throw senderError;
      toast.success("Profile and sender details saved.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save profile."); } finally { setPending(false); }
  }
  return <form onSubmit={save} className="space-y-6"><Card id="account"><CardHeader><CardTitle>Personal profile</CardTitle><p className="mt-1 text-sm text-[#68736f]">Your workspace identity. It stays separate from the sender shown in email.</p></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><Field label="Full name" name="full_name" defaultValue={profile.full_name} required /><Field label="Profile email" name="profile_email" type="email" defaultValue={profile.email} /><Field label="Timezone" name="timezone" defaultValue={profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone} /><Field label="Location" name="profile_location" defaultValue={profile.location} /></CardContent></Card><Card id="sender"><CardHeader><CardTitle>Sender profile</CardTitle><p className="mt-1 text-sm text-[#68736f]">Reusable values for template placeholders and your signature.</p></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><Field label="Sender name" name="sender_name" defaultValue={sender.sender_name || profile.full_name} required /><Field label="Designation / job title" name="designation" defaultValue={sender.designation} /><Field label="Organization / company" name="organization" defaultValue={sender.organization} /><Field label="Sender email" name="sender_email" type="email" defaultValue={sender.sender_email || profile.email} /><Field label="Company phone" name="company_phone" defaultValue={sender.company_phone} /><Field label="Mobile" name="mobile" defaultValue={sender.mobile} /><Field label="Website" name="website" type="url" defaultValue={sender.website} /><Field label="Location" name="sender_location" defaultValue={sender.location} /><div className="md:col-span-2"><Field label="Company address" name="company_address" defaultValue={sender.company_address} /></div></CardContent></Card><div className="flex justify-end"><Button type="submit" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" size={15} /> : <Save size={15} />}Save profile</Button></div></form>;
}
function Field({ label, name, defaultValue, ...props }: { label: string; name: string; defaultValue?: string | null } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "defaultValue" | "name">) { return <div><Label htmlFor={name}>{label}</Label><Input id={name} name={name} defaultValue={defaultValue ?? ""} {...props} /></div>; }
