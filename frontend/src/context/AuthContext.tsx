import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as authStore from "../lib/authStore";
import { api } from "../lib/api";

export interface Profile {
  id: string;
  username: string;
  full_name: string | null;
  email: string | null;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string | null, password: string, fullName: string, username: string) => Promise<void>;
  signIn: (identifier: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  completePasswordReset: (accessToken: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(authStore.isAuthenticated());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile() {
    try {
      const p = await api.get<Profile>("/me");
      setProfile(p);
    } catch {
      setProfile(null);
    }
  }

  useEffect(() => {
    if (authStore.isAuthenticated()) {
      loadProfile().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }

    const unsubscribe = authStore.onAuthChange((tokens) => {
      setIsAuthenticated(tokens !== null);
      if (tokens) {
        loadProfile();
      } else {
        setProfile(null);
      }
    });

    return unsubscribe;
  }, []);

  async function signUp(email: string | null, password: string, fullName: string, username: string) {
    await authStore.signUp(email, password, fullName, username);
  }

  async function signIn(identifier: string, password: string) {
    await authStore.signIn(identifier, password);
  }

  async function signOut() {
    await authStore.signOut();
  }

  async function requestPasswordReset(email: string) {
    await authStore.requestPasswordReset(email);
  }

  async function completePasswordReset(accessToken: string, newPassword: string) {
    await authStore.completePasswordReset(accessToken, newPassword);
  }

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, profile, loading, signUp, signIn, signOut, refreshProfile: loadProfile, requestPasswordReset, completePasswordReset }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
