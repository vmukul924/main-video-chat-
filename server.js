const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "public")));

let waiting = null; // ek time pe ek hi waiting user

io.on("connection", (socket) => {
  console.log("🟢 New connection:", socket.id);

  // ---- Join Event ----
  socket.on("join", () => {
    if (waiting === null) {
      // koi wait nahi kar raha → isko wait me daalo
      waiting = socket.id;
      socket.emit("waiting");
    } else {
      // already ek banda wait kar raha hai → dono ko match karo
      const room = waiting + "#" + socket.id;
      const a = io.sockets.sockets.get(waiting);
      const b = socket;

      if (a) {
        a.join(room);
        b.join(room);

        a.emit("matched", { room, role: "caller", partner: b.id });
        b.emit("matched", { room, role: "callee", partner: a.id });

        waiting = null; // queue khali ho gayi
      } else {
        // agar waiting banda disconnect ho gaya tha
        waiting = socket.id;
        socket.emit("waiting");
      }
    }
  });

  // ---- WebRTC Signaling ----
  socket.on("signal", ({ to, data }) => {
    io.to(to).emit("signal", { from: socket.id, data });
  });

  // ---- Chat Messages ----
  socket.on("send_message", ({ text, roomId }) => {
    const msg = {
      from: socket.id,
      text,
      createdAt: new Date().toISOString(),
    };
    if (roomId) {
      socket.to(roomId).emit("receive_message", msg);
    }
  });

  // ---- Typing Indicator ----
  socket.on("typing", ({ roomId }) => {
    if (roomId) socket.to(roomId).emit("typing");
  });

  socket.on("stop_typing", ({ roomId }) => {
    if (roomId) socket.to(roomId).emit("stop_typing");
  });

  // ---- Leave ----
  socket.on("leave", (roomId) => {
    if (roomId) {
      socket.leave(roomId);
      socket.to(roomId).emit("partner_left", { leaver: socket.id });
    }
    if (waiting === socket.id) waiting = null;
  });

  // ---- Disconnect ----
  socket.on("disconnect", () => {
    console.log("🔴 Disconnected:", socket.id);

    // agar waiting list me tha → remove karo
    if (waiting === socket.id) waiting = null;

    // agar kisi room me tha → uske partner ko notify karo
    socket.rooms.forEach((room) => {
      if (room !== socket.id) {
        socket.to(room).emit("partner_left", { leaver: socket.id });
      }
    });
  });
});

// ---- Start Server ----
const PORT = process.env.PORT || 4000;
server.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
