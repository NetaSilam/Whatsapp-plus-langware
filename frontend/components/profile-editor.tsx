"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmojiPickerButton } from "@/components/emoji-picker-button";

type Profile = { displayName: string; bio: string | null; avatarUrl: string | null; email: string };

export function ProfileEditor() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch("/api/profile");
    if (res.ok) {
      const data = await res.json();
      setProfile(data);
      setBio(data.bio ?? "");
    }
  }
  useEffect(() => { load(); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    const fd = new FormData();
    fd.append("bio", bio);
    const file = fileRef.current?.files?.[0];
    if (file) fd.append("file", file);
    const res = await fetch("/api/profile", { method: "PATCH", body: fd });
    setSaving(false);
    if (res.ok) {
      if (fileRef.current) fileRef.current.value = "";
      setSaved(true);
      load();
    }
  }

  if (!profile) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <form onSubmit={save} className="grid gap-5">
      <div className="flex items-center gap-4">
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatarUrl} alt="avatar" className="h-20 w-20 rounded-full border object-cover" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full border bg-muted text-2xl font-semibold">
            {profile.displayName[0]?.toUpperCase()}
          </div>
        )}
        <div className="grid gap-1">
          <p className="font-semibold">{profile.displayName}</p>
          <p className="text-sm text-muted-foreground">{profile.email}</p>
          <label className="cursor-pointer text-xs text-primary underline">
            Change photo
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={() => save({ preventDefault: () => {} } as React.FormEvent)} />
          </label>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="bio">Bio</Label>
        <div className="flex gap-2">
          <Input
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A short description about yourself…"
            maxLength={160}
          />
          <EmojiPickerButton onEmoji={(e) => setBio((b) => (b + e).slice(0, 160))} direction="bottom" />
        </div>
        <p className="text-xs text-muted-foreground">{bio.length}/160</p>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        {saved && <span className="text-sm text-green-600">Saved!</span>}
      </div>
    </form>
  );
}
