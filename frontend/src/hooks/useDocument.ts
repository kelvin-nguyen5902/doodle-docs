import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { DocumentFull } from "../types";

export function useDocument(docId: string | undefined) {
  const [doc, setDoc] = useState<DocumentFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!docId) return;
    try {
      const d = await api.get<DocumentFull>(`/documents/${docId}`);
      setDoc(d);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load document");
    }
  }, [docId]);

  useEffect(() => {
    setLoading(true);
    setDoc(null);
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  return { doc, setDoc, loading, error, refresh };
}
