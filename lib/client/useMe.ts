"use client";

import { useEffect, useState } from "react";

export interface Me {
  email: string | null;
  name: string | null;
  picture: string | null;
  isAdmin: boolean;
  features: { history: boolean; email: boolean; signIn: boolean; googleSignIn: boolean; emailSignIn: boolean };
}

let cache: Promise<Me | null> | null = null;

function loadMe(): Promise<Me | null> {
  cache ??= fetch("/api/me", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<Me>) : null))
    .catch(() => null);
  return cache;
}

/** Current viewer and enabled features (fetched once per page load). */
export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let alive = true;
    void loadMe().then((m) => alive && setMe(m));
    return () => {
      alive = false;
    };
  }, []);
  return me;
}
