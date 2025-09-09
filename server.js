const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// serve frontend files from /public
app.use(express.static(path.join(__dirname, "public")));

let waiting = null; // matchmaking waiting queue

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  // ---- Join matchmaking ----
  socket.on("join", () => {
    if (waiting === null) {
      // koi nahi wait kar raha hai
      waiting = socket.id;
      socket.emit("waiting");
    } else {
      // ek waiting user mil gaya → dono ko match karo
      const room = waiting + "#" + socket.id;
      const a = io.sockets.sockets.get(waiting);
      const b = socket;

      if (a) {
        a.join(room);
        b.join(room);

        // roles assign
        a.emit("matched", { room, role: "caller", partner: b.id });
        b.emit("matched", { room, role: "callee", partner: a.id });

        waiting = null;
      } else {
        waiting = socket.id;
        socket.emit("waiting");
      }
    }
  });

  // ---- WebRTC signaling ----
  socket.on("signal", ({ to, data }) => {
    io.to(to).emit("signal", { from: socket.id, data });
  });

  // ---- Chat messages ----
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

  // ---- Handle leave button ----
  socket.on("leave", (roomId) => {
    if (roomId) {
      socket.leave(roomId);
      socket.to(roomId).emit("partner_left", { leaver: socket.id });
      console.log(`User ${socket.id} left room ${roomId}`);
    }
    if (waiting === socket.id) waiting = null;
  });

  // ---- Handle disconnect ----
  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);

    if (waiting === socket.id) {
      waiting = null;
    }

    // notify all rooms this user was part of
    socket.rooms.forEach((room) => {
      if (room !== socket.id) {
        socket.to(room).emit("partner_left", { leaver: socket.id });
      }
    });
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
