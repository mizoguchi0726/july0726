const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

const rooms = new Map();
const getRoom = (id) => {
  if (!rooms.has(id)) rooms.set(id, { players: new Map(), sockets: new Set(), messages: [] });
  return rooms.get(id);
};
const send = (ws, data) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(data));
const broadcast = (roomId, data, except = null) => {
  const room = rooms.get(roomId); if (!room) return;
  for (const sock of room.sockets) if (sock !== except) send(sock, data);
};
const broadcastAll = (roomId, data) => {
  const room = rooms.get(roomId); if (!room) return;
  for (const sock of room.sockets) send(sock, data);
};

wss.on("connection", (ws) => {
  ws.playerId = null; ws.roomId = null;
  send(ws, { type: "hello", serverTime: Date.now() });

  ws.on("message", (raw) => {
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === "join") {
      const roomId = String(msg.roomId || "velvet-district-3d");
      const player = msg.player || {};
      ws.playerId = player.id; ws.roomId = roomId;
      const room = getRoom(roomId);
      room.sockets.add(ws);
      room.players.set(player.id, { ...player, lastSeen: Date.now() });
      send(ws, {
        type: "snapshot",
        roomId,
        selfId: player.id,
        players: Array.from(room.players.values()),
        messages: room.messages.slice(-40),
      });
      broadcast(roomId, { type: "player_joined", player: { ...player, lastSeen: Date.now() } }, ws);
      return;
    }

    if (!ws.roomId) return;
    const room = getRoom(ws.roomId);

    if (msg.type === "presence") {
      const player = msg.player || {};
      room.players.set(player.id, { ...player, lastSeen: Date.now() });
      broadcast(ws.roomId, { type: "presence", player: room.players.get(player.id) }, ws);
      return;
    }

    if (msg.type === "chat") {
      const message = {
        id: String(msg.message?.id || Date.now()),
        playerId: String(msg.message?.playerId || ""),
        playerName: String(msg.message?.playerName || "Player"),
        text: String(msg.message?.text || "").slice(0, 200),
        ts: Date.now(),
      };
      room.messages.push(message);
      room.messages = room.messages.slice(-80);
      broadcastAll(ws.roomId, { type: "chat", message });
    }
  });

  ws.on("close", () => {
    if (!ws.roomId || !ws.playerId) return;
    const room = rooms.get(ws.roomId);
    if (!room) return;
    room.sockets.delete(ws);
    const leaving = room.players.get(ws.playerId);
    room.players.delete(ws.playerId);
    if (leaving) broadcast(ws.roomId, { type: "leave", id: ws.playerId, name: leaving.name });
    if (room.sockets.size === 0) rooms.delete(ws.roomId);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    for (const [playerId, player] of room.players.entries()) {
      if (now - (player.lastSeen || 0) > 10000) {
        room.players.delete(playerId);
        broadcast(roomId, { type: "leave", id: playerId, name: player.name });
      }
    }
    if (room.sockets.size === 0) rooms.delete(roomId);
  }
}, 3000);

server.listen(PORT, () => console.log(`MMO server running on http://localhost:${PORT}`));