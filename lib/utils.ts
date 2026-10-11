import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function formatNumber(n: number | null | undefined) {
  return n == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(n);
}
export function titleCase(s: string) {
  return s
    .toLowerCase()
    .replace(/(^|_)\w/g, (x) => x.replace("_", " ").toUpperCase());
}
