"use client";

import { signOut, useSession } from "@/lib/auth-client";
import { LogOut, Settings, User } from "lucide-react";
import { useRouter } from "next/navigation";

export function UserMenu() {
  const { data: session } = useSession();
  const router = useRouter();

  if (!session) return null;

  return (
    <div className="relative group">
      <button className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors">
        {session.user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={session.user.image}
            alt={session.user.name}
            className="h-6 w-6 rounded-full"
          />
        ) : (
          <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center">
            <User className="h-3.5 w-3.5 text-primary" />
          </div>
        )}
        <span className="hidden sm:block font-medium">{session.user.name}</span>
      </button>

      <div className="absolute right-0 top-full mt-1 w-48 rounded-md border bg-popover shadow-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
        <div className="p-1">
          <div className="px-2 py-1.5 text-xs text-muted-foreground border-b mb-1">
            {session.user.email}
          </div>
          <button
            onClick={() => router.push("/admin/settings")}
            className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent transition-colors"
          >
            <Settings className="h-4 w-4" />
            Settings
          </button>
          <button
            onClick={() =>
              signOut({ fetchOptions: { onSuccess: () => router.push("/login") } })
            }
            className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
