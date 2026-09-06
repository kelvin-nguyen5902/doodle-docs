import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

interface ToastContextValue {
  flash: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const flash = useCallback((message: string) => {
    clearTimeout(timerRef.current);
    setToast(message);
    timerRef.current = setTimeout(() => setToast(""), 2600);
  }, []);

  return (
    <ToastContext.Provider value={{ flash }}>
      {children}
      {toast && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            top: 28,
            transform: "translateX(-50%)",
            zIndex: 70,
            background: "var(--text)",
            color: "var(--bg)",
            padding: "11px 18px",
            borderRadius: 10,
            fontSize: 13,
            boxShadow: "0 12px 30px rgba(26,26,25,.25)",
            animation: "rise .2s ease-out",
            display: "flex",
            alignItems: "center",
            gap: 9,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--ac)" }} />
          {toast}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
