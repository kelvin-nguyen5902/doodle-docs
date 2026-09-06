import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import type { DocumentSummary } from "../types";

interface DocumentsContextValue {
  documents: DocumentSummary[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const DocumentsContext = createContext<DocumentsContextValue | undefined>(undefined);

export function DocumentsProvider({ children }: { children: ReactNode }) {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const docs = await api.get<DocumentSummary[]>("/documents");
    setDocuments(docs);
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  return <DocumentsContext.Provider value={{ documents, loading, refresh }}>{children}</DocumentsContext.Provider>;
}

export function useDocumentsContext() {
  const ctx = useContext(DocumentsContext);
  if (!ctx) throw new Error("useDocumentsContext must be used within DocumentsProvider");
  return ctx;
}
