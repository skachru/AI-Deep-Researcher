"use client";

import { BarChart3, History, LogIn, LogOut } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/client/useMe";

/** History, admin and sign-in links; adapts to the features configured on the server. */
export function AccountNav() {
  const me = useMe();
  if (!me) return <div className="h-8 w-20" aria-hidden />;
  return (
    <nav className="flex items-center gap-1" aria-label="Account">
      {me.features.history && (
        <Button variant="ghost" size="sm" asChild>
          <Link href="/history">
            <History /> <span className="hidden sm:inline">History</span>
          </Link>
        </Button>
      )}
      {me.isAdmin && (
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin">
            <BarChart3 /> <span className="hidden sm:inline">Admin</span>
          </Link>
        </Button>
      )}
      {me.email ? (
        <form action="/api/auth/logout" method="post" className="flex items-center gap-1">
          {me.picture ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote avatar, tiny
            <img
              src={me.picture}
              alt=""
              referrerPolicy="no-referrer"
              className="size-6 rounded-full border border-border"
            />
          ) : (
            <span className="grid size-6 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent uppercase">
              {me.email[0]}
            </span>
          )}
          <span className="hidden max-w-40 truncate text-[12.5px] text-muted md:inline" title={me.email}>
            {me.name ?? me.email}
          </span>
          <Button variant="ghost" size="sm" type="submit" aria-label="Sign out">
            <LogOut />
          </Button>
        </form>
      ) : (
        me.features.signIn && (
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">
              <LogIn /> <span className="hidden sm:inline">Sign in</span>
            </Link>
          </Button>
        )
      )}
    </nav>
  );
}
