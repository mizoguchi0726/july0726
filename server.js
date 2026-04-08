const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      players: new Map(),
      sockets: new Set(),
      messages: [],
    });
  }
  return rooms.get(roomId);
}

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(roomId, data, exceptWs = null) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const sock of room.sockets) {
    if (sock !== exceptWs) send(sock, data);
  }
}

function cleanupRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  if (room.sockets.size === 0) rooms.delete(roomId);
}

wss.on("connection", (ws) => {
  ws.playerId = null;
  ws.roomId = null;

  send(ws, { type: "hello", serverTime: Date.now() });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      return;
    }

    if (msg.type === "join") {
      const roomId = String(msg.roomId || "meadow");
      const player = msg.player || {};
      ws.playerId = player.id;
      ws.roomId = roomId;

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

      broadcast(roomId, {
        type: "player_joined",
        player: { ...player, lastSeen: Date.now() },
      }, ws);

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
        id: msg.message?.id,
        playerId: msg.message?.playerId,
        playerName: msg.message?.playerName,
        text: String(msg.message?.text || "").slice(0, 200),
        ts: Date.now(),
      };
      room.messages.push(message);
      room.messages = room.messages.slice(-80);
      broadcast(ws.roomId, { type: "chat", message });
      return;
    }
  });

  ws.on("close", () => {
    if (!ws.roomId || !ws.playerId) return;
    const room = rooms.get(ws.roomId);
    if (!room) return;

    room.sockets.delete(ws);
    const leavingPlayer = room.players.get(ws.playerId);
    room.players.delete(ws.playerId);

    if (leavingPlayer) {
      broadcast(ws.roomId, {
        type: "leave",
        id: ws.playerId,
        name: leavingPlayer.name,
      });
    }

    cleanupRoom(ws.roomId);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    for (const [playerId, player] of room.players.entries()) {
      if (now - (player.lastSeen || 0) > 10000) {
        room.players.delete(playerId);
        broadcast(roomId, {
          type: "leave",
          id: playerId,
          name: player.name,
        });
      }
    }
    cleanupRoom(roomId);
  }
}, 3000);

server.listen(PORT, () => {
  console.log(`MMO server running on http://localhost:${PORT}`);
});