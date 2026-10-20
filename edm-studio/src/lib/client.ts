"use client";
import { create } from "zustand";
export const useUI = create<{
  page: string;
  setPage: (page: string) => void;
  toast: string;
  notify: (message: string) => void;
}>((set) => ({
  page: "overview",
  setPage: (page) => {
    set({ page });
    if (typeof window !== "undefined")
      history.replaceState(null, "", `#${page}`);
  },
  toast: "",
  notify: (message) => {
    set({ toast: message });
    setTimeout(() => set({ toast: "" }), 5000);
  },
}));
export async function api(path: string, method = "GET", body?: unknown) {
  const r = await fetch(`/api/${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) {
    const e = new Error(data.error || "请求失败") as Error & { status: number };
    e.status = r.status;
    throw e;
  }
  return data;
}
export const date = (v: string | null | undefined) =>
  v
    ? new Date(v).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "—";
export const money = (v: number, currency = "USD") =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(v);
