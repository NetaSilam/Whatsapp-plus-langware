"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { initials } from "@/lib/format";
import type { User } from "@/lib/types";

type Mode = "login" | "register";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await api.post<{ dev_code: string }>("/api/auth/request-otp", {
        phone,
        username: mode === "register" ? username : undefined,
      });
      setDevCode(res.dev_code);
      setCode(res.dev_code); // dev convenience: prefill
      setStep("otp");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post<User>("/api/auth/verify", { phone, code });
      if (mode === "register" && photoFile) {
        try {
          const up = await api.upload<{ url: string }>(photoFile);
          await api.patch("/api/users/me", { photo_url: up.url });
        } catch {
          /* non-fatal: continue without photo */
        }
      }
      router.replace("/chats");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500 text-2xl">
          💬
        </div>
        <h1 className="text-2xl font-semibold">
          {mode === "register" ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {step === "phone"
            ? "Enter your phone number to continue"
            : "Enter the 6-digit verification code"}
        </p>
      </div>

      {step === "phone" ? (
        <form onSubmit={requestOtp} className="space-y-4">
          {mode === "register" && (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-full outline-none"
              >
                <Avatar className="h-20 w-20 border">
                  {photoPreview && <AvatarImage src={photoPreview} alt="" />}
                  <AvatarFallback className="text-lg">
                    {username ? initials(username) : "＋"}
                  </AvatarFallback>
                </Avatar>
              </button>
              <span className="text-xs text-muted-foreground">Add a photo (optional)</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPickPhoto}
              />
            </div>
          )}
          {mode === "register" && (
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Alice"
                required
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone number</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 000 0001"
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Sending…" : "Send code"}
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          {devCode && (
            <div className="rounded-md border border-dashed bg-muted/50 p-3 text-center text-sm">
              <span className="text-muted-foreground">Dev mode — your code is </span>
              <span className="font-mono text-base font-bold tracking-widest">{devCode}</span>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="code">Verification code</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              maxLength={6}
              className="text-center text-lg tracking-[0.4em]"
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Verifying…" : "Verify & continue"}
          </Button>
          <button
            type="button"
            onClick={() => setStep("phone")}
            className="w-full text-center text-sm text-muted-foreground hover:underline"
          >
            ← Use a different number
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {mode === "register" ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-foreground hover:underline">
              Log in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/register" className="font-medium text-foreground hover:underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
