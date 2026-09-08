import { API_BASE_URL as BASE_URL } from "../config";

const STORAGE_KEY = "dd_auth";

export interface AuthUser {
  id: string;
  email: string;
}

interface TokenSet {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch ms
  user: AuthUser;
}

type Listener = (tokens: TokenSet | null) => void;

function loadFromStorage(): TokenSet | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TokenSet) : null;
  } catch {
    return null;
  }
}

let tokens: TokenSet | null = loadFromStorage();
let refreshPromise: Promise<TokenSet | null> | null = null;
const listeners = new Set<Listener>();

const REFRESH_BUFFER_MS = 60_000;

function persist(next: TokenSet | null) {
  if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  else localStorage.removeItem(STORAGE_KEY);
}

function setTokens(next: TokenSet | null) {
  tokens = next;
  persist(next);
  listeners.forEach((l) => l(next));
}

export function getUser(): AuthUser | null {
  return tokens?.user ?? null;
}

export function onAuthChange(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

interface SessionPayload {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: AuthUser;
}

function fromSessionPayload(payload: SessionPayload): TokenSet {
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: Date.now() + payload.expires_in * 1000,
    user: payload.user,
  };
}

class AuthFetchError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function authFetch(path: string, body: unknown): Promise<SessionPayload> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AuthFetchError(data?.error || "Something went wrong.", res.status);
  }
  return data as SessionPayload;
}

export async function signUp(email: string | null, password: string, fullName: string, username: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email || undefined, password, full_name: fullName, username }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Something went wrong.");
  if (res.status === 202) {
    throw new Error("Check your email to confirm your account, then sign in.");
  }
  setTokens(fromSessionPayload(data as SessionPayload));
}

export async function signIn(identifier: string, password: string): Promise<void> {
  const payload = await authFetch("/auth/login", { identifier, password });
  setTokens(fromSessionPayload(payload));
}

// Requests a password reset email for the given address.
export async function requestPasswordReset(email: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || "Something went wrong.");
  }
}

// Sets a new password using a recovery access token. Doesn't log the user
// in, since the recovery token gets invalidated right after this succeeds.
export async function completePasswordReset(accessToken: string, newPassword: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/me/password`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ password: newPassword }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || "Could not reset password.");
  }
}

// Clears the local session and best effort revokes it on the backend.
export async function signOut(): Promise<void> {
  const current = tokens;
  setTokens(null);
  if (current) {
    fetch(`${BASE_URL}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${current.access_token}` },
    }).catch(() => {});
  }
}

// Delays between retrying a failed token refresh, to ride out transient
// network or backend blips instead of logging the user out unnecessarily.
const REFRESH_RETRY_DELAYS_MS = [1500, 3000];

// Refreshes the access token, retrying with backoff before giving up.
export async function refreshTokens(): Promise<TokenSet | null> {
  if (!tokens) return null;
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = tokens!.refresh_token;
    for (let attempt = 0; ; attempt++) {
      try {
        const payload = await authFetch("/auth/refresh", { refresh_token: refreshToken });
        const next = fromSessionPayload(payload);
        setTokens(next);
        return next;
      } catch (err) {
        // A rejected refresh token (expired, revoked, already rotated) is a
        // definitive 4xx that will never succeed on retry — only network
        // blips and backend 5xxs are worth riding out with backoff.
        const status = err instanceof AuthFetchError ? err.status : undefined;
        const permanent = status !== undefined && status < 500;
        if (permanent || attempt >= REFRESH_RETRY_DELAYS_MS.length) {
          setTokens(null);
          return null;
        }
        await new Promise((r) => setTimeout(r, REFRESH_RETRY_DELAYS_MS[attempt]));
      }
    }
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

export async function ensureFreshAccessToken(): Promise<string | null> {
  if (!tokens) return null;
  if (Date.now() < tokens.expires_at - REFRESH_BUFFER_MS) {
    return tokens.access_token;
  }
  const next = await refreshTokens();
  return next?.access_token ?? null;
}

export function getAccessTokenSync(): string | null {
  return tokens?.access_token ?? null;
}

export function isAuthenticated(): boolean {
  return tokens !== null;
}
