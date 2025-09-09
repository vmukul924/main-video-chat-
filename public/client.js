// ---- Socket.IO ----
const socket = io(
  // agar backend alag domain pe deploy hai to URL yaha do
  // example: "https://your-backend.onrender.com"
  { autoConnect: false }
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
let myRole = null;
let partnerId = null; // 🔑 partner ka socket.id store hoga

// ---- Media Access ----
async function getMedia() {
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    // 🔥 Mirror effect fix (ulta camera theek hoga)
    localV.style.transform = "scaleX(-1)";

    localV.srcObject = s;
    localStream = s;
    return true;
  } catch (e) {
    alert("Camera/microphone access required: " + e.message);
    return false;
  }
}

// ---- Create PeerConnection ----
function createPC() {
  const configuration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
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
    if (e.candidate && partnerId) {
      socket.emit("signal", {
        to: partnerId,
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
  leaveRoom();
  // 1.5 sec ke baad automatically find new partner
  setTimeout(() => {
    socket.connect();
    socket.emit("join");
  }, 1500);
};

// ---- Leave Room helper ----
function leaveRoom() {
  if (pc) pc.close();
  pc = null;

  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localV.srcObject = null;
    localStream = null;
  }

  if (currentRoom) {
    socket.emit("leave", currentRoom);
    currentRoom = null;
  }

  partnerId = null;
  leaveBtn.disabled = true;
  startBtn.disabled = false;
  status.textContent = "Left the call";
}

// ---- Socket Events ----
socket.on("waiting", () => {
  status.textContent = "Waiting for a partner...";
});

socket.on("matched", async ({ room, role, partner }) => {
  status.textContent = "Matched! Setting up call...";
  currentRoom = room;
  myRole = role;
  partnerId = partner; // 🔑 partner id set karo
  createPC();

  if (myRole === "caller") {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("signal", {
      to: partnerId,
      data: { type: "offer", sdp: offer },
    });
  }

  leaveBtn.disabled = false;
});

socket.on("signal", async ({ from, data }) => {
  if (!pc && localStream) createPC();

  if (data.type === "offer" && myRole === "callee") {
    partnerId = from; // ensure partner set hai
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("signal", {
      to: partnerId,
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

// ---- Partner Left ----
socket.on("partner_left", () => {
  status.textContent = "Partner left. Finding new partner...";
  leaveRoom();
  setTimeout(() => {
    socket.connect();
    socket.emit("join");
  }, 1500);
});

// ---- Chat ----
sendBtn.onclick = () => {
  const text = msgInput.value.trim();
  if (!text) return;
  const msg = { text, roomId: currentRoom };
  socket.emit("send_message", msg);
  addMessage("me", text);
  msgInput.value = "";
};

msgInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendBtn.click();
});

socket.on("receive_message", (msg) => {
  addMessage("partner", msg.text);
});

// ✅ Chat Bubble system
function addMessage(type, text) {
  const div = document.createElement("div");
  div.classList.add("message", type);
  div.textContent = text;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
