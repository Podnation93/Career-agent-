import { redirect } from "next/navigation";
import type { UserDTO } from "@jobpilot/shared";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { serverFetch } from "@/lib/api";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await serverFetch<{ user: UserDTO }>("/api/auth/me");
  if (!me) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar userEmail={me.user.email} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
