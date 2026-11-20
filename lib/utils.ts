import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
export const formatDate = (date: string | null | undefined) =>
  date
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        timeZone: "UTC",
      }).format(new Date(date.slice(0, 10) + "T00:00:00Z"))
    : "Unscheduled";
export const formatMoney = (paise: number | null) =>
  paise === null
    ? "Cost unavailable"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
      }).format(paise / 100);
export const formatKg = (kg: number) =>
  Number(kg).toLocaleString("en-IN", { maximumFractionDigits: 3 }) + " kg";
