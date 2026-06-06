import { createContext, useContext } from "react";

export type Corner = "bottom-right" | "bottom-left" | "top-right" | "top-left";

export type ZopackStatus = "idle" | "loading" | "ready" | "saving" | "error";

export interface ZopackContextValue {
  isOpen: boolean;
  label: string;
  status: ZopackStatus;
  error: string | null;
  openPanel(): void;
  closePanel(): void;
  togglePanel(): void;
}

export const ZopackContext = createContext<ZopackContextValue | null>(null);

export function useZopackContext(): ZopackContextValue | null {
  return useContext(ZopackContext);
}

export function describeZopackStatus(status: ZopackStatus): { label: string; color: string; pulse: boolean } {
  switch (status) {
    case "loading":
      return { label: "Loading", color: "#d8a657", pulse: true };
    case "ready":
      return { label: "Ready", color: "#1f9d55", pulse: false };
    case "saving":
      return { label: "Saving", color: "#d8a657", pulse: true };
    case "error":
      return { label: "Error", color: "#dc2626", pulse: false };
    case "idle":
    default:
      return { label: "Idle", color: "#64748b", pulse: false };
  }
}
