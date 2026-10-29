"use client";

import { CheckCircle2, CircleAlert, X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

type Toast = { id: number; title: string; description?: string; tone: "success" | "error" | "info" };
type Ctx = { toast: (t: Omit<Toast, "id">) => void };

const ToastContext = React.createContext<Ctx>({ toast: () => {} });

export function useToast() {
  return React.useContext(ToastContext);
}

export function Toaster({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<Toast[]>([]);
  const toast = React.useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev.slice(-3), { ...t, id }]);
    setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), 5200);
  }, []);
  const value = React.useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "animate-[cc-toast-in_.45s_var(--cc-ease-spring)_backwards] pointer-events-auto flex items-start gap-3 rounded-cc border p-3.5 shadow-[0_20px_50px_-20px_rgba(17,17,22,0.45)]",
              t.tone === "error" ? "border-danger/20 bg-paper" : "border-white/10 bg-charcoal text-white",
            )}
          >
            {t.tone === "error" ? <CircleAlert className="mt-0.5 size-4 text-danger" /> : <CheckCircle2 className="mt-0.5 size-4 text-lavender" />}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">{t.title}</p>
              {t.description && <p className={cn("mt-0.5 text-[12px]", t.tone === "error" ? "text-muted" : "text-white/65")}>{t.description}</p>}
            </div>
            <button onClick={() => setItems((p) => p.filter((x) => x.id !== t.id))} aria-label="Dismiss notification" className="opacity-60 hover:opacity-100">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
