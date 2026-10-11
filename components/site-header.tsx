import Link from "next/link";
import { LogoMark } from "@/components/home/hero-art";
import { AccountNav } from "@/components/account-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 text-[14px] font-semibold tracking-tight", className)}>
      <LogoMark className="size-7" />
      Lumen
    </Link>
  );
}

export function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-12 max-w-[1440px] items-center gap-3 px-4">
        <Logo />
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">{children}</div>
        <Link href="/how-it-works" className="hidden text-[13px] text-muted hover:text-foreground sm:block">
          How it works
        </Link>
        <a
          href="https://github.com/skachru/AI-Deep-Researcher"
          target="_blank"
          rel="noreferrer"
          className="hidden text-[13px] text-muted hover:text-foreground sm:block"
        >
          GitHub
        </a>
        <AccountNav />
        <ThemeToggle />
      </div>
    </header>
  );
}
