const socket = io(
  // agar backend alag domain pe deploy hai to URL yaha do
  // example: "https://your-backend.onrender.com"
);

const startBtn = document.getElementById('startBtn');
const leaveBtn = document.getElementById('leaveBtn');
const status = document.getElementById('status');
const localV = document.getElementById('local');
const remoteV = document.getElementById('remote');

let pc = null;
let localStream = null;
let currentRoom = null;
let myRole = null; // caller ya callee

async function getMedia() {
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    localV.srcObject = s;
    localStream = s;
    return true;
  } catch (e) {
    alert('Camera/microphone access required: ' + e.message);
    return false;
  }
}

function createPC(roomId) {
  // STUN + TURN (replace TURN creds with your server details in production)
  const configuration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      {
        urls: ['turn:your-turn-server.com:3478'],
        username: 'testuser',
        credential: 'testpass'
      }
    ]
  };

  pc = new RTCPeerConnection(configuration);

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit('signal', {
        to: roomId,
        data: { type: 'ice', candidate: e.candidate }
      });
    }
  };

  pc.ontrack = (e) => {
    remoteV.srcObject = e.streams[0];
  };

  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
}

startBtn.onclick = async () => {
  startBtn.disabled = true;
  status.textContent = 'Getting camera...';
  const ok = await getMedia();
  if (!ok) {
    startBtn.disabled = false;
    return;
  }
  status.textContent = 'Connecting to server...';
  socket.emit('join');
};

leaveBtn.onclick = () => {
  if (pc) pc.close();
  pc = null;

  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localV.srcObject = null;
    localStream = null;
  }

  socket.disconnect();
  window.location.reload();
};

socket.on('waiting', () => {
  status.textContent = 'Waiting for a partner...';
});

socket.on('matched', async ({ room, role }) => {
  status.textContent = 'Matched! Setting up call...';
  currentRoom = room;
  myRole = role; // role save karo
  createPC(room);

  if (myRole === 'caller') {
    // Sirf caller hi offer banayega
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal', {
      to: room,
      data: { type: 'offer', sdp: offer }
    });
  }

  leaveBtn.disabled = false;
});

socket.on('signal', async ({ from, data }) => {
  if (!pc && localStream) createPC(from);

  if (data.type === 'offer' && myRole === 'callee') {
    // Callee: offer receive karke answer banata hai
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('signal', {
      to: from,
      data: { type: 'answer', sdp: answer }
    });
    leaveBtn.disabled = false;
    status.textContent = 'In call';
  } else if (data.type === 'answer' && myRole === 'caller') {
    // Caller: answer set karta hai
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    status.textContent = 'In call';
  } else if (data.type === 'ice') {
    try {
      await pc.addIceCandidate(data.candidate);
    } catch (e) {
      console.warn('ICE error', e);
    }
  }
});
