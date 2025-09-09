// ---- Socket.IO ----
const socket = io(
  // agar backend alag domain pe deploy hai to URL yaha do
  // example: "https://your-backend.onrender.com"
);

// ---- DOM Elements ----
const startBtn = document.getElementById("startBtn");
const leaveBtn = document.getElementById("leaveBtn");
const status = document.getElementById("status");
const localV = document.getElementById("local");
const remoteV = document.getElementById("remote");

// Chat elements
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const messagesDiv = document.getElementById("messages");

// ---- State ----
let pc = null;
let localStream = null;
let currentRoom = null;
let myRole = null; // caller ya callee

// ---- Media Access ----
async function getMedia() {
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localV.srcObject = s;
    localStream = s;
    return true;
  } catch (e) {
    alert("Camera/microphone access required: " + e.message);
    return false;
  }
}

// ---- Create PeerConnection ----
function createPC(roomId) {
  const configuration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      // Turn server (replace with production credentials)
      {
        urls: ["turn:your-turn-server.com:3478"],
        username: "testuser",
        credential: "testpass",
      },
    ],
  };

  pc = new RTCPeerConnection(configuration);

  // Send ICE candidates
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit("signal", {
        to: roomId,
        data: { type: "ice", candidate: e.candidate },
      });
    }
  };

  // Remote stream
  pc.ontrack = (e) => {
    remoteV.srcObject = e.streams[0];
  };

  // Add local tracks
  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
}

// ---- Start Button ----
startBtn.onclick = async () => {
  startBtn.disabled = true;
  status.textContent = "Getting camera...";
  const ok = await getMedia();
  if (!ok) {
    startBtn.disabled = false;
    return;
  }
  status.textContent = "Connecting to server...";
  socket.connect();
  socket.emit("join");
};

// ---- Leave Button ----
leaveBtn.onclick = () => {
  if (pc) pc.close();
  pc = null;

  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localV.srcObject = null;
    localStream = null;
  }

  socket.disconnect();
  window.location.reload();
};

// ---- Socket Events ----
socket.on("waiting", () => {
  status.textContent = "Waiting for a partner...";
});

socket.on("matched", async ({ room, role }) => {
  status.textContent = "Matched! Setting up call...";
  currentRoom = room;
  myRole = role;
  createPC(room);

  if (myRole === "caller") {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("signal", {
      to: room,
      data: { type: "offer", sdp: offer },
    });
  }

  leaveBtn.disabled = false;
});

socket.on("signal", async ({ from, data }) => {
  if (!pc && localStream) createPC(from);

  if (data.type === "offer" && myRole === "callee") {
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("signal", {
      to: from,
      data: { type: "answer", sdp: answer },
    });
    leaveBtn.disabled = false;
    status.textContent = "In call";
  } else if (data.type === "answer" && myRole === "caller") {
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    status.textContent = "In call";
  } else if (data.type === "ice") {
    try {
      await pc.addIceCandidate(data.candidate);
    } catch (e) {
      console.warn("ICE error", e);
    }
  }
});

// ---- Chat ----
sendBtn.onclick = () => {
  if (!msgInput.value.trim()) return;
  const msg = { text: msgInput.value, roomId: currentRoom };
  socket.emit("send_message", msg);
  addMessage("You", msg.text);
  msgInput.value = "";
};

socket.on("receive_message", (msg) => {
  addMessage("Partner", msg.text);
});

function addMessage(sender, text) {
  const div = document.createElement("div");
  div.textContent = `${sender}: ${text}`;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
