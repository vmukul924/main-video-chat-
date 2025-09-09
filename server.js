const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// serve frontend files from /public
app.use(express.static(path.join(__dirname, "public")));

// Simple matchmaking: pair users in rooms of 2
let waiting = null;

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  socket.on("join", () => {
    if (waiting === null) {
      waiting = socket.id;
      socket.emit("waiting");
    } else {
      const room = waiting + "#" + socket.id;
      const a = io.sockets.sockets.get(waiting);
      const b = socket;

      if (a) {
        a.join(room);
        b.join(room);

        // assign roles
        a.emit("matched", { room, role: "caller" });
        b.emit("matched", { room, role: "callee" });

        waiting = null;
      } else {
        waiting = socket.id;
        socket.emit("waiting");
      }
    }
  });

  // signaling (WebRTC)
  socket.on("signal", ({ to, data }) => {
    io.to(to).emit("signal", { from: socket.id, data });
  });

  // --- Chat message handling ---
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

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
    if (waiting === socket.id) {
      waiting = null;
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));
