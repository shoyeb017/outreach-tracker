"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Mode = "login" | "register" | "forgot" | "update";
type AuthValues = { full_name: string | undefined; email: string | undefined; password: string | undefined };

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const [requestError, setRequestError] = useState("");
  const schema = useMemo(() => z.object({
    full_name: mode === "register" ? z.string().trim().min(2, "Enter your full name.").max(120) : z.string().optional(),
    email: mode === "update" ? z.string().optional() : z.email("Enter a valid email address."),
    password: mode === "forgot" ? z.string().optional() : z.string().min(8, "Use at least eight characters.").max(200),
  }), [mode]);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<AuthValues>({ resolver: zodResolver(schema), defaultValues: { full_name: "", email: "", password: "" } });
  const needsName = mode === "register";
  const title = { login: "Welcome back", register: "Create your account", forgot: "Reset your password", update: "Choose a new password" }[mode];
  const subtitle = { login: "Sign in to continue to your workspace.", register: "Start in test mode and connect Microsoft when you are ready.", forgot: "We’ll send a secure recovery link to your email.", update: "Use at least eight characters for your new password." }[mode];

  async function submit(values: AuthValues) {
    setRequestError("");
    const email = values.email?.trim() ?? "";
    const password = values.password ?? "";
    try {
      const supabase = getSupabaseBrowserClient();
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(params.get("next") || "/dashboard"); router.refresh();
      } else if (mode === "register") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: values.full_name?.trim() }, emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding` } });
        if (error) throw error;
        if (data.session) { router.push("/onboarding"); router.refresh(); }
        else toast.success("Check your email to verify your account.");
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/update-password` });
        if (error) throw error;
        toast.success("If the account exists, a recovery link is on its way.");
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        toast.success("Password updated."); router.push("/dashboard");
      }
    } catch (cause) {
      setRequestError(cause instanceof Error ? cause.message : "Something went wrong.");
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border bg-white p-7 shadow-[0_24px_70px_rgba(29,52,45,.09)]">
      <h1 className="text-2xl font-semibold tracking-[-.035em]">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-[#68736f]">{subtitle}</p>
      <form className="mt-7 space-y-4" onSubmit={handleSubmit(submit)} noValidate>
        {needsName && <div><Label htmlFor="full_name">Full name</Label><Input id="full_name" autoComplete="name" {...register("full_name")} />{errors.full_name && <p className="mt-1 text-xs text-[#b42318]">{errors.full_name.message}</p>}</div>}
        {mode !== "update" && <div><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" {...register("email")} />{errors.email && <p className="mt-1 text-xs text-[#b42318]">{errors.email.message}</p>}</div>}
        {mode !== "forgot" && <div><div className="flex justify-between"><Label htmlFor="password">Password</Label>{mode === "login" && <Link className="text-xs font-semibold text-[#176b55]" href="/forgot-password">Forgot password?</Link>}</div><Input id="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} {...register("password")} />{errors.password && <p className="mt-1 text-xs text-[#b42318]">{errors.password.message}</p>}</div>}
        {requestError && <div role="alert" className="rounded-lg border border-[#efc4c0] bg-[#fff4f3] px-3 py-2 text-sm text-[#9b241c]">{requestError}</div>}
        <Button className="w-full" size="lg" type="submit" disabled={isSubmitting}>{isSubmitting && <LoaderCircle className="animate-spin" size={16} />}{mode === "login" ? "Sign in" : mode === "register" ? "Create account" : mode === "forgot" ? "Send reset link" : "Update password"}</Button>
      </form>
      <div className="mt-6 border-t pt-5 text-center text-sm text-[#68736f]">{mode === "login" ? <>New here? <Link className="font-semibold text-[#176b55]" href="/register">Create an account</Link></> : mode === "register" ? <>Already have an account? <Link className="font-semibold text-[#176b55]" href="/login">Sign in</Link></> : <Link className="font-semibold text-[#176b55]" href="/login">Back to sign in</Link>}</div>
    </div>
  );
}
