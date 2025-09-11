// ---- Socket.IO ----
const socket = io({ autoConnect: false });

// ---- DOM Elements ----
const startBtn = document.getElementById("startBtn");
const leaveBtn = document.getElementById("leaveBtn");
const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const modeBtn = document.getElementById("modeBtn");
const status = document.getElementById("status");
const localV = document.getElementById("local");
const remoteV = document.getElementById("remote");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const messagesDiv = document.getElementById("messages");
const toast = document.getElementById("toast");

// ---- State ----
let pc = null, localStream = null, currentRoom = null;
let myRole = null, partnerId = null;
let typingTimeout = null;

// ---- Helpers ----
function showToast(text) {
  toast.textContent = text;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2000);
}

// ---- Media Access ----
async function getMedia() {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localV.style.transform = "scaleX(-1)";
    localV.srcObject = s;
    localStream = s;
    return true;
  } catch (e) {
    alert("Camera/microphone required: " + e.message);
    return false;
  }
}

// ---- PeerConnection ----
function createPC() {
  pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  pc.onicecandidate = (e) => {
    if (e.candidate && partnerId) {
      socket.emit("signal", { to: partnerId, data: { type: "ice", candidate: e.candidate } });
    }
  };
  pc.ontrack = (e) => { remoteV.srcObject = e.streams[0]; };
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
}

// ---- Buttons ----
startBtn.onclick = async () => {
  startBtn.disabled = true;
  status.textContent = "Getting camera...";
  if (!(await getMedia())) { startBtn.disabled = false; return; }
  status.textContent = "Connecting...";
  socket.connect();
  socket.emit("join");
};

leaveBtn.onclick = () => {
  leaveRoom();
  setTimeout(() => { socket.connect(); socket.emit("join"); }, 1500);
};

muteBtn.onclick = () => {
  if (!localStream) return;
  const mic = localStream.getAudioTracks()[0];
  mic.enabled = !mic.enabled;
  muteBtn.textContent = mic.enabled ? "Mute Mic" : "Unmute Mic";
};

cameraBtn.onclick = () => {
  if (!localStream) return;
  const cam = localStream.getVideoTracks()[0];
  cam.enabled = !cam.enabled;
  cameraBtn.textContent = cam.enabled ? "Stop Camera" : "Start Camera";
};

modeBtn.onclick = () => {
  document.body.classList.toggle("dark");
  modeBtn.textContent = document.body.classList.contains("dark") ? "Light Mode" : "Dark Mode";
};

// ---- Leave Room ----
function leaveRoom() {
  if (pc) pc.close();
  pc = null;
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localV.srcObject = null;
    localStream = null;
  }
  if (currentRoom) { socket.emit("leave", currentRoom); currentRoom = null; }
  partnerId = null;
  leaveBtn.disabled = true;
  startBtn.disabled = false;
  status.textContent = "Left the call";
}

// ---- Socket Events ----
socket.on("waiting", () => { status.textContent = "Waiting for a partner..."; });

socket.on("matched", async ({ room, role, partner }) => {
  showToast("Partner connected ✅");
  status.textContent = "Matched! Setting up...";
  currentRoom = room; myRole = role; partnerId = partner;
  createPC();
  if (myRole === "caller") {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("signal", { to: partnerId, data: { type: "offer", sdp: offer } });
  }
  leaveBtn.disabled = false;
});

socket.on("signal", async ({ from, data }) => {
  if (!pc && localStream) createPC();
  if (data.type === "offer" && myRole === "callee") {
    partnerId = from;
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("signal", { to: partnerId, data: { type: "answer", sdp: answer } });
    leaveBtn.disabled = false;
    status.textContent = "In call";
  } else if (data.type === "answer" && myRole === "caller") {
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    status.textContent = "In call";
  } else if (data.type === "ice") {
    try { await pc.addIceCandidate(data.candidate); } catch (e) { console.warn("ICE error", e); }
  }
});

socket.on("partner_left", () => {
  showToast("Partner disconnected ❌");
  status.textContent = "Partner left. Finding new...";
  leaveRoom();
  setTimeout(() => { socket.connect(); socket.emit("join"); }, 1500);
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
  else {
    socket.emit("typing", { roomId: currentRoom });
    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit("stop_typing", { roomId: currentRoom }), 1000);
  }
});

socket.on("receive_message", (msg) => { addMessage("partner", msg.text); });
socket.on("typing", () => showTyping());
socket.on("stop_typing", () => removeTyping());

// ---- Chat Bubble ----
function addMessage(type, text) {
  removeTyping();
  const div = document.createElement("div");
  div.classList.add("message", type);
  div.textContent = text;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ---- Typing Indicator ----
function showTyping() {
  if (document.getElementById("typing")) return;
  const div = document.createElement("div");
  div.id = "typing";
  div.classList.add("typing");
  div.textContent = "Partner is typing...";
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
function removeTyping() {
  const t = document.getElementById("typing");
  if (t) t.remove();
}
