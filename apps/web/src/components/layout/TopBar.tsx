"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui";
import { apiFetch } from "@/lib/client";

export function TopBar({ userEmail }: { userEmail: string | null }) {
  const router = useRouter();

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-sm text-slate-500 dark:text-slate-400">
        Human-in-the-loop · we never auto-apply
      </div>
      <div className="flex items-center gap-3">
        <Link href="/import">
          <Button>+ Import job</Button>
        </Link>
        {userEmail && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500 dark:text-slate-400">{userEmail}</span>
            <Button variant="ghost" onClick={logout}>
              Logout
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
