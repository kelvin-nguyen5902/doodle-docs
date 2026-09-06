// Where the backend lives. Falls back to local dev defaults.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5001/api";
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5001";
