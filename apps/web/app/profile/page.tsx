import { PageShell } from "@/components/page-shell";
import { ProfileClient } from "@/components/profile-client";

export default function ProfilePage() {
  return (
    <PageShell className="flex items-center justify-center">
      <ProfileClient />
    </PageShell>
  );
}
