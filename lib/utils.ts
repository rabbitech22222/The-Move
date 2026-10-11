import { koreanLabel } from "./korean";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function formatNumber(n: number | null | undefined) {
  return n == null
    ? "—"
    : new Intl.NumberFormat("ko-KR", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(n);
}
export function titleCase(s: string) {
  return koreanLabel(s);
}
