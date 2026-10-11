import { cn } from "@/lib/utils";
export function Badge({ children, className }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-[var(--border)] px-2 py-0.5 text-[10px] font-semibold tracking-wide",
        className,
      )}
    >
      {children}
    </span>
  );
}
