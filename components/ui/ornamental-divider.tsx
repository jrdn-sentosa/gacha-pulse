import { Diamond } from "lucide-react";
import { cn } from "@/lib/utils";

/** Gacha-style section break: a centered glyph with thin lines fading out on either side. */
export function OrnamentalDivider({ className }: { className?: string }) {
  return (
    <div role="presentation" aria-hidden="true" className={cn("flex items-center gap-3", className)}>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-border" />
      <Diamond className="h-2.5 w-2.5 shrink-0 fill-primary/40 text-primary/60" />
      <span className="h-px flex-1 bg-gradient-to-l from-transparent via-border to-border" />
    </div>
  );
}
