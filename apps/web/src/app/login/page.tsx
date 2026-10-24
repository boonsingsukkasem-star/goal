import { AppleMac, Facebook, Google, Lock as LockKeyhole, ShieldCheck } from "iconoir-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  continueWithProvider,
  requestPasswordReset,
  signInWithPassword,
  signUpWithPassword,
  updatePassword,
} from "@/lib/auth/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  description: "เข้าสู่ระบบ Goal เพื่อบันทึกทีมโปรด ติดตามแมตช์ และรับการวิเคราะห์ฟุตบอล",
  title: "เข้าสู่ระบบ",
};

type LoginMode = "forgot" | "reset" | "signin" | "signup";

const errorMessages: Record<string, string> = {
  callback: "ลิงก์เข้าสู่ระบบไม่ถูกต้องหรือหมดอายุ กรุณาลองใหม่",
  "display-name": "กรุณากรอกชื่อที่แสดงไม่เกิน 80 ตัวอักษร",
  "invalid-credentials": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  "invalid-provider": "ช่องทางเข้าสู่ระบบไม่ถูกต้อง",
  "oauth-start": "ไม่สามารถเริ่มการเข้าสู่ระบบด้วยบัญชีภายนอกได้",
  "password-length": "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร",
  "password-match": "รหัสผ่านทั้งสองช่องไม่ตรงกัน",
  "password-update": "เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาขอลิงก์ใหม่",
  "reset-request": "ส่งอีเมลรีเซ็ตรหัสผ่านไม่สำเร็จ กรุณาลองอีกครั้ง",
  "reset-session": "ลิงก์รีเซ็ตรหัสผ่านหมดอายุ กรุณาขอลิงก์ใหม่",
  "signup-failed": "สร้างบัญชีไม่สำเร็จ กรุณาตรวจสอบข้อมูลแล้วลองอีกครั้ง",
};

const messageContent: Record<string, { body: string; title: string }> = {
  "check-email": {
    body: "เราได้ส่งลิงก์ยืนยันบัญชีไปยังอีเมลของคุณแล้ว",
    title: "ตรวจสอบอีเมลของคุณ",
  },
  "password-updated": {
    body: "ใช้รหัสผ่านใหม่เพื่อเข้าสู่ระบบได้ทันที",
    title: "เปลี่ยนรหัสผ่านแล้ว",
  },
  "reset-email": {
    body: "หากอีเมลนี้มีบัญชีอยู่ ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้คุณ",
    title: "ตรวจสอบอีเมลของคุณ",
  },
};

function SocialAuth() {
  const providers = [
    { icon: Facebook, label: "Continue with Facebook", provider: "facebook" },
    { icon: Google, label: "Continue with Google", provider: "google" },
  ] as const;

  return (
    <div className="space-y-3">
      {providers.map((item) => (
        <form action={continueWithProvider} key={item.provider}>
          <input name="provider" type="hidden" value={item.provider} />
          <AuthSubmitButton
            className="h-12 w-full normal-case"
            pendingLabel="Connecting..."
            variant="outline"
          >
            <span className="relative flex w-full items-center justify-center">
              <span
                aria-hidden="true"
                className="absolute left-0 flex size-6 items-center justify-center sm:left-[20%]"
              >
                <item.icon className="size-5" strokeWidth={1.8} />
              </span>
              <span className="text-center font-label text-xs font-bold tracking-[0.1em] uppercase">
                {item.label}
              </span>
            </span>
          </AuthSubmitButton>
        </form>
      ))}
    </div>
  );
}

function AuthInput({
  autoComplete,
  autoFocus,
  label,
  minLength,
  name,
  placeholder,
  type,
}: {
  autoComplete: string;
  autoFocus?: boolean;
  label: string;
  minLength?: number;
  name: string;
  placeholder: string;
  type: "email" | "password" | "text";
}) {
  return (
    <Field>
      <FieldLabel className="text-muted-foreground" htmlFor={`auth-${name}`}>
        {label}
      </FieldLabel>
      <Input
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        className="h-12 border-0 border-b-2 border-border bg-[#1a1b1f] px-4 text-base focus-visible:ring-0"
        id={`auth-${name}`}
        maxLength={type === "text" ? 80 : undefined}
        minLength={minLength}
        name={name}
        placeholder={placeholder}
        required
        type={type}
      />
    </Field>
  );
}

function modeFrom(value?: string): LoginMode {
  if (value === "signup" || value === "forgot" || value === "reset") return value;
  return "signin";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const mode = modeFrom(params.mode);
  if (mode !== "reset") {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) redirect("/account");
  }
  const error = params.error
    ? (errorMessages[params.error] ?? "ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง")
    : null;
  const message = params.message ? messageContent[params.message] : undefined;
  const heading =
    mode === "signup"
      ? "Create Your Account"
      : mode === "forgot"
        ? "Reset Your Password"
        : mode === "reset"
          ? "Set New Password"
          : "Sign In To Goal";
  const description =
    mode === "signup"
      ? "สร้างพื้นที่ฟุตบอลที่ตรงกับทีม นักเตะ และลีกที่คุณติดตาม"
      : mode === "forgot"
        ? "กรอกอีเมลที่ใช้สมัคร แล้วเราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่"
        : mode === "reset"
          ? "ตั้งรหัสผ่านใหม่ที่มีอย่างน้อย 8 ตัวอักษร"
          : "เข้าสู่ personalized football dashboard ของคุณ";

  return (
    <main className="goal-auth-shell flex min-h-[calc(100vh-4rem)] flex-col bg-background text-foreground">
      <div className="flex flex-1 flex-col md:flex-row">
        <section className="relative hidden overflow-hidden border-r border-border md:block md:w-1/2 lg:w-3/5">
          <Image
            alt=""
            aria-hidden="true"
            className="object-cover object-center"
            fill
            priority
            src="/images/auth-player-tunnel-sharp-4k-v15.jpg"
            unoptimized
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-[58%] bg-gradient-to-r from-black/45 via-black/15 to-transparent"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t from-black/50 via-black/10 to-transparent"
          />
          <div className="absolute inset-x-0 bottom-0 z-10 p-8 lg:p-14">
            <p className="font-label text-xs font-bold tracking-[0.18em] text-primary uppercase">
              Football intelligence, live
            </p>
            <h1 className="mt-3 font-headline text-7xl leading-[0.9] uppercase lg:text-8xl">
              Own The
              <br />
              <span className="text-primary">Pitch.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-7 text-white/75">
              Live score, AI-powered match context และ tactical insights ในประสบการณ์เดียว
            </p>
          </div>
        </section>

        <section className="flex w-full flex-1 items-center justify-center bg-background px-4 py-10 md:w-1/2 md:px-8 lg:w-2/5">
          <div className="w-full max-w-md">
            <div className="text-center md:text-left">
              <p className="flex items-center justify-center gap-2 font-label text-xs font-bold tracking-[0.16em] text-primary uppercase md:justify-start">
                <ShieldCheck className="size-4" /> Goal member access
              </p>
              <h2 className="mt-2 font-headline text-4xl leading-tight uppercase sm:text-5xl">
                {heading}
              </h2>
              <p className="mt-2 leading-6 text-muted-foreground">{description}</p>
            </div>

            {error && (
              <Alert className="mt-6" variant="destructive">
                <LockKeyhole />
                <AlertTitle>Authentication error</AlertTitle>
                <AlertDescription className="text-current">{error}</AlertDescription>
              </Alert>
            )}
            {message && (
              <Alert className="mt-6" role="status" variant="success">
                <ShieldCheck />
                <AlertTitle className="text-primary">{message.title}</AlertTitle>
                <AlertDescription>{message.body}</AlertDescription>
              </Alert>
            )}

            {(mode === "signin" || mode === "signup") && (
              <>
                <div className="mt-8">
                  <SocialAuth />
                </div>
                <div className="my-6 flex items-center gap-4">
                  <Separator className="flex-1" />
                  <span className="font-label text-[0.65rem] font-bold tracking-[0.12em] text-muted-foreground">
                    OR
                  </span>
                  <Separator className="flex-1" />
                </div>
              </>
            )}

            {mode === "forgot" ? (
              <form action={requestPasswordReset} className="mt-8 space-y-6">
                <AuthInput
                  autoComplete="email"
                  autoFocus
                  label="Email Address"
                  name="email"
                  placeholder="Enter your email"
                  type="email"
                />
                <AuthSubmitButton className="h-14 w-full text-lg" pendingLabel="Sending link...">
                  Send reset link
                </AuthSubmitButton>
              </form>
            ) : mode === "reset" ? (
              <form action={updatePassword} className="mt-8 space-y-5">
                <AuthInput
                  autoComplete="new-password"
                  autoFocus
                  label="New Password"
                  minLength={8}
                  name="password"
                  placeholder="At least 8 characters"
                  type="password"
                />
                <AuthInput
                  autoComplete="new-password"
                  label="Confirm Password"
                  minLength={8}
                  name="passwordConfirmation"
                  placeholder="Enter your password again"
                  type="password"
                />
                <AuthSubmitButton className="h-14 w-full text-lg" pendingLabel="Updating...">
                  Update password
                </AuthSubmitButton>
              </form>
            ) : (
              <form
                action={mode === "signup" ? signUpWithPassword : signInWithPassword}
                className="space-y-5"
              >
                {mode === "signup" && (
                  <AuthInput
                    autoComplete="name"
                    autoFocus
                    label="Display Name"
                    name="displayName"
                    placeholder="Your name"
                    type="text"
                  />
                )}
                <AuthInput
                  autoComplete="email"
                  autoFocus={mode === "signin"}
                  label="Email Address"
                  name="email"
                  placeholder="Enter your email"
                  type="email"
                />
                <div>
                  <div className="mb-[-1.25rem] flex justify-end">
                    {mode === "signin" && (
                      <Link
                        className="z-10 font-label text-xs font-bold tracking-[0.08em] text-primary uppercase hover:underline"
                        href="/login?mode=forgot"
                      >
                        Forgot?
                      </Link>
                    )}
                  </div>
                  <AuthInput
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    label="Password"
                    minLength={8}
                    name="password"
                    placeholder="Enter your password"
                    type="password"
                  />
                </div>
                <AuthSubmitButton
                  className="h-14 w-full text-lg"
                  pendingLabel={mode === "signup" ? "Creating..." : "Signing in..."}
                >
                  {mode === "signup" ? "Create Account" : "Sign In"}
                </AuthSubmitButton>
              </form>
            )}

            <div className="mt-7 text-center">
              {mode === "signin" ? (
                <p className="text-muted-foreground">
                  Don&apos;t have an account?{" "}
                  <Link
                    className="font-bold text-primary hover:underline"
                    href="/login?mode=signup"
                  >
                    Sign up
                  </Link>
                </p>
              ) : (
                <Link className="font-bold text-primary hover:underline" href="/login">
                  กลับไปหน้าเข้าสู่ระบบ
                </Link>
              )}
            </div>

            {(mode === "signin" || mode === "signup") && (
              <p className="mt-7 flex items-center justify-center gap-2 border-t border-border pt-5 text-center text-xs text-muted-foreground">
                <AppleMac
                  aria-hidden="true"
                  className="size-[18px] shrink-0"
                  fill="currentColor"
                  strokeWidth={0}
                />{" "}
                Sign in with Apple ใช้งานผ่านแอป Goal บน iOS
              </p>
            )}
            {mode === "signup" && (
              <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
                เมื่อสร้างบัญชี คุณยอมรับ{" "}
                <Link className="text-foreground hover:underline" href="/privacy">
                  นโยบายความเป็นส่วนตัว
                </Link>
                {" และ "}
                <Link className="text-foreground hover:underline" href="/support">
                  เงื่อนไขการใช้งาน
                </Link>
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
