const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// serve frontend files from /public
app.use(express.static(path.join(__dirname, 'public')));

// Simple matchmaking: pair users in rooms of 2
let waiting = null;

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  socket.on('join', () => {
    if (waiting === null) {
      // koi wait nahi kar raha, abhi ke liye isko wait pe daal do
      waiting = socket.id;
      socket.emit('waiting');
    } else {
      // ek banda wait kar raha hai -> dono ko ek room me daal do
      const room = waiting + '#' + socket.id;
      const a = io.sockets.sockets.get(waiting);
      const b = socket;

      if (a) {
        a.join(room);
        b.join(room);

        // role assign karo -> pehle wale ko caller, naye ko callee
        a.emit('matched', { room, role: 'caller' });
        b.emit('matched', { room, role: 'callee' });

        waiting = null;
      } else {
        // agar waiting client disconnect ho gaya tha
        waiting = socket.id;
        socket.emit('waiting');
      }
    }
  });

  socket.on('signal', ({ to, data }) => {
    // signaling data forward karo (offer/answer/ice)
    io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
    if (waiting === socket.id) {
      waiting = null;
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));
