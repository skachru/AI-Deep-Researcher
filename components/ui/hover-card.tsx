"use client";

import * as HoverCardPrimitive from "@radix-ui/react-hover-card";
import { cn } from "@/lib/utils";

export const HoverCard = HoverCardPrimitive.Root;
export const HoverCardTrigger = HoverCardPrimitive.Trigger;

export function HoverCardContent({ className, ...props }: React.ComponentProps<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Content
        sideOffset={6}
        className={cn(
          "z-50 w-80 rounded-lg border border-border bg-surface p-3.5 text-[13px] shadow-pop outline-none",
          className,
        )}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  );
}
