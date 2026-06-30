import { redirect } from "next/navigation";

import { ProfileEditor } from "@/components/profile-editor";
import { getCurrentUser } from "@/lib/auth";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <main className="container mx-auto max-w-lg p-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">My profile</h1>
      <ProfileEditor />
    </main>
  );
}
