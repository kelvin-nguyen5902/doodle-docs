import { io, type Socket } from "socket.io-client";
import { ensureFreshAccessToken, onAuthChange } from "./authStore";
import { SOCKET_URL } from "../config";

let socket: Socket | null = null;

// Returns the shared socket, creating it (or refreshing its auth token) as needed.
export async function getSocket(): Promise<Socket> {
  const token = await ensureFreshAccessToken();

  if (socket) {
    if (socket.auth && (socket.auth as { token?: string }).token !== token) {
      socket.auth = { token };
      socket.disconnect();
      socket.connect();
    }
    return socket;
  }

  socket = io(SOCKET_URL, { auth: { token }, autoConnect: true });
  return socket;
}

onAuthChange((tokens) => {
  if (!socket) return;
  socket.auth = { token: tokens?.access_token };
  if (!tokens) {
    socket.disconnect();
  } else {
    socket.disconnect();
    socket.connect();
  }
});

// Reloads the page when a backgrounded tab comes back to a dead socket,
// since mobile browsers can stall reconnection indefinitely while hidden.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !socket || socket.connected) return;
    window.location.reload();
  });
}
