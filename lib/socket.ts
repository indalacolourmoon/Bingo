import { io, Socket } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";

let socket: Socket | null = null;

export const getBingoSocket = (): Socket => {
  if (!socket) {
    socket = io(`${SOCKET_URL}/bingo`, {
      autoConnect: false,
      transports: ["websocket"],
    });
  }
  return socket;
};
