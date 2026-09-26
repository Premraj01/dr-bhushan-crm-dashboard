import { io, type Socket } from "socket.io-client";
import { useEffect } from "react";
import { getToken } from "./api";

const WS_URL = import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL || undefined;

let socket: Socket | undefined;

/** Lazily opens a single shared connection to the backend's /realtime namespace. */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(`${WS_URL ?? ""}/realtime`, {
      auth: (cb) => cb({ token: getToken() }),
      transports: ["websocket"],
    });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = undefined;
}

/**
 * Subscribe to a realtime event (e.g. "patient.created") for the lifetime of a component.
 * Pass `enabled: false` to skip connecting, e.g. in an offline demo session without a token.
 */
export function useSocketEvent<T>(event: string, handler: (payload: T) => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const s = getSocket();
    s.on(event, handler);
    return () => {
      s.off(event, handler);
    };
  }, [event, handler, enabled]);
}
