const $ = (id) => document.getElementById(id);

export class MeetingClient {
  constructor({ onPauseApp = () => {}, onResumeApp = () => {}, onLocalStream = () => {} } = {}) {
    this.onPauseApp = onPauseApp;
    this.onResumeApp = onResumeApp;
    this.onLocalStream = onLocalStream;
    this.overlay = $("meetOverlay");
    this.roomId = "";
    this.peerId = "";
    this.role = "";
    this.remotePeerId = "";
    this.localStream = null;
    this.pc = null;
    this.pollTimer = 0;
    this.pollBusy = false;
    this.opened = false;
    this.active = false;
    this.makingOffer = false;
    this.pendingIce = [];
    this.turnConfigured = false;
    this.connectionGeneration = 0;
    this.lastInviteUrl = "";
    this.matchStartedAt = 0;
    this.statsTimer = 0;
    this.lastStats = null;
    this.iceRestartAttempts = 0;
    this.bind();
  }

  bind() {
    $("meetBtn")?.addEventListener("click", () => this.open());
    $("closeMeetBtn")?.addEventListener("click", () => this.close());
    $("createRoomBtn")?.addEventListener("click", () => void this.start("create"));
    $("randomMatchBtn")?.addEventListener("click", () => void this.start("random"));
    $("joinRoomBtn")?.addEventListener("click", () => void this.start("join"));
    $("hangupBtn")?.addEventListener("click", () => void this.hangup());
    $("copyInviteBtn")?.addEventListener("click", () => void this.copyInvite());
    $("toggleMicBtn")?.addEventListener("click", () => this.toggleTrack("audio", "toggleMicBtn", "🎙 Tắt mic", "🔇 Bật mic"));
    $("toggleCameraBtn")?.addEventListener("click", () => this.toggleTrack("video", "toggleCameraBtn", "📷 Tắt camera", "📷 Bật camera"));
    $("meetRoomInput")?.addEventListener("keydown", (event) => { if (event.key === "Enter") void this.start("join"); });
    addEventListener("keydown", (event) => { if (event.key === "Escape" && this.opened) void this.close(); });
    const invitedRoom = new URLSearchParams(location.search).get("meet");
    if (invitedRoom) queueMicrotask(() => this.open({ roomId: invitedRoom }));
  }

  setStatus(message, kind = "info") {
    const el = $("meetStatus");
    if (el) { el.textContent = message; el.dataset.kind = kind; }
  }

  open({ roomId = "" } = {}) {
    if (this.opened) return;
    this.opened = true;
    this.overlay?.classList.remove("hidden");
    this.overlay?.setAttribute("aria-hidden", "false");
    this.onPauseApp();
    if (roomId) $("meetRoomInput").value = roomId;
    if (roomId) this.setStatus("Đã nhận mã mời. Nhấn Tham gia để kết nối.");
    else this.setStatus("Tạo phòng mới hoặc nhập mã mời từ người còn lại.");
  }

  async api(path, options = {}) {
    const response = await fetch(path, { cache: "no-store", ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
    let body = {};
    try { body = await response.json(); } catch {}
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }

  parseRoomInput(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      const url = new URL(raw, location.href);
      const fromUrl = url.searchParams.get("meet");
      if (fromUrl) return fromUrl.trim().toLowerCase();
    } catch {}
    return raw.toLowerCase().replace(/[^a-f0-9]/g, "");
  }

  inviteUrl(roomId) {
    const url = new URL(location.href);
    url.search = ""; url.hash = ""; url.searchParams.set("meet", roomId);
    return url.toString();
  }

  async start(mode) {
    if (this.active) return;
    const requestedRoom = mode === "join" ? this.parseRoomInput($("meetRoomInput").value) : "";
    if (mode === "join" && !/^[a-f0-9]{16}$/.test(requestedRoom)) {
      this.setStatus("Mã phòng không hợp lệ. Hãy dán mã 16 ký tự hoặc đường dẫn mời đầy đủ.", "error");
      return;
    }
    const createBtn = $("createRoomBtn"), joinBtn = $("joinRoomBtn");
    createBtn.disabled = joinBtn.disabled = true;
    this.setStatus("Đang xin quyền camera/microphone…");
    const generation = ++this.connectionGeneration;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !globalThis.RTCPeerConnection) throw new Error("Trình duyệt thiếu WebRTC hoặc camera/microphone. Hãy mở bằng HTTPS trên trình duyệt mới.");
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: { facingMode: { ideal: "user" }, width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 30, max: 30 } } });
      await this.onLocalStream(this.localStream);
      if (generation !== this.connectionGeneration) { this.stopLocalMedia(); return; }
      $("localVideo").srcObject = this.localStream;
      void $("localVideo").play().catch(() => {});
      this.peerId = globalThis.crypto?.randomUUID?.() || `peer_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
      if (mode === "create") {
        const created = await this.api("/api/meet/rooms", { method: "POST", body: JSON.stringify({ peerId: this.peerId }) });
        this.roomId = created.roomId; this.role = "host";
      } else if (mode === "random") {
        const result = await this.api("/api/meet/match", { method: "POST", body: JSON.stringify({ peerId: this.peerId }) });
        this.roomId = result.roomId; this.role = result.role; this.matchStartedAt = Date.now();
      } else {
        const joined = await this.api(`/api/meet/rooms/${requestedRoom}/join`, { method: "POST", body: JSON.stringify({ peerId: this.peerId }) });
        this.roomId = joined.roomId; this.role = joined.role;
      }
      if (generation !== this.connectionGeneration) {
        if (this.roomId && this.peerId) await this.api(`/api/meet/rooms/${this.roomId}/leave`, { method: "POST", body: JSON.stringify({ peerId: this.peerId }) }).catch(() => {});
        return;
      }
      this.active = true;
      this.lastInviteUrl = this.inviteUrl(this.roomId);
      $("meetInviteRow").classList.remove("hidden");
      $("meetInviteUrl").value = this.lastInviteUrl;
      $("meetRoomBadge").textContent = `PHÒNG ${this.roomId}`;
      $("meetRoomInput").value = this.roomId;
      $("meetLobby").classList.add("hidden");
      $("meetCallControls").classList.remove("hidden");
      $("meetVideoGrid").classList.remove("hidden");
      $("hangupBtn").classList.remove("hidden");
      const config = await this.api("/api/meet/config");
      if (generation !== this.connectionGeneration || !this.active) return;
      this.turnConfigured = !!config.turnConfigured;
      this.setStatus(mode === "random" ? "Đang ghép ngẫu nhiên… Skeleton vẫn nhận diện tay trong cuộc gọi. Bạn có thể hủy bất cứ lúc nào." : (this.turnConfigured ? "Đang chờ người thứ hai… TURN đã cấu hình." : "Đang chờ người thứ hai… Chưa cấu hình TURN; một số mạng NAT có thể không kết nối được."));
      $("hangupBtn").textContent = mode === "random" ? "✕ Hủy ghép / kết thúc" : "☎ Kết thúc cuộc gọi";
      await this.createPeerConnection(config.iceServers);
      if (generation === this.connectionGeneration && this.active) this.schedulePoll(0);
    } catch (error) {
      if (generation === this.connectionGeneration) {
        if (this.roomId && this.peerId) void this.api(`/api/meet/rooms/${this.roomId}/leave`, { method: "POST", body: JSON.stringify({ peerId: this.peerId }) }).catch(() => {});
        this.active = false; this.roomId = ""; this.peerId = ""; this.role = "";
        this.closePeerConnection(); this.stopLocalMedia();
        this.setStatus(error?.message || "Không thể bắt đầu cuộc gọi.", "error");
      }
    } finally {
      createBtn.disabled = joinBtn.disabled = false;
    }
  }

  async createPeerConnection(iceServers) {
    this.closePeerConnection();
    this.pendingIce = [];
    const pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 4 });
    this.pc = pc;
    for (const track of this.localStream?.getTracks() || []) pc.addTrack(track, this.localStream);
    pc.ontrack = (event) => {
      const remote = $("remoteVideo");
      if (event.streams?.[0]) remote.srcObject = event.streams[0];
      else {
        let stream = remote.srcObject;
        if (!(stream instanceof MediaStream)) remote.srcObject = stream = new MediaStream();
        if (!stream.getTracks().some(t => t.id === event.track.id)) stream.addTrack(event.track);
      }
      void remote.play().catch(() => {});
      $("remotePlaceholder")?.classList.add("hidden");
    };
    pc.onicecandidate = (event) => {
      if (event.candidate && this.active && this.remotePeerId) {
        void this.sendSignal("ice", event.candidate.toJSON()).catch(error => this.setStatus(`Tín hiệu ICE lỗi: ${error.message}`, "error"));
      }
    };
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind === "video") {
        try { const params = sender.getParameters(); params.degradationPreference = "maintain-framerate"; params.encodings = params.encodings?.length ? params.encodings : [{}]; params.encodings[0].maxBitrate = 1_500_000; void sender.setParameters(params).catch(() => {}); } catch {}
      }
    }
    pc.onconnectionstatechange = () => {
      if (pc !== this.pc) return;
      const state = pc.connectionState;
      if (state === "connected") { this.setStatus("Đã kết nối trực tiếp. Âm thanh/video và cử chỉ Skeleton đang chạy song song.", "success"); $("hangupBtn").textContent = "☎ Kết thúc cuộc gọi"; this.startNetworkStats(); }
      else if (state === "failed") this.setStatus("Kết nối thất bại. Hãy thử bật TURN trên máy chủ hoặc đổi mạng.", "error");
      else if (state === "disconnected") this.setStatus("Kết nối gián đoạn; đang chờ WebRTC tự khôi phục…", "warn");
    };
    pc.oniceconnectionstatechange = () => {
      if (pc !== this.pc) return;
      if (pc.iceConnectionState === "failed") {
        this.setStatus("Đường ICE lỗi; đang thử khôi phục. Nếu tiếp tục lỗi, hãy cấu hình TURN hoặc đổi mạng.", "warn");
        void this.recoverIce(pc);
      } else if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") this.iceRestartAttempts = 0;
    };
  }

  async sendSignal(type, payload = {}) {
    if (!this.active || !this.roomId || !this.peerId || !this.remotePeerId) return;
    await this.api(`/api/meet/rooms/${this.roomId}/signal`, { method: "POST", body: JSON.stringify({ fromPeerId: this.peerId, toPeerId: this.remotePeerId, type, payload }) });
  }

  schedulePoll(delay = 900) {
    clearTimeout(this.pollTimer);
    if (!this.active) return;
    this.pollTimer = setTimeout(() => void this.poll(), delay);
  }

  async poll() {
    if (!this.active || this.pollBusy) return this.schedulePoll(300);
    this.pollBusy = true;
    try {
      const state = await this.api(`/api/meet/rooms/${this.roomId}/state?peerId=${encodeURIComponent(this.peerId)}`);
      const others = state.peers.filter(p => p.peerId !== this.peerId);
      const otherId = others[0]?.peerId || "";
      if (this.matchStartedAt && !otherId && Date.now() - this.matchStartedAt > 120_000) {
        this.setStatus("Hết 120 giây mà chưa ghép được người phù hợp. Bạn có thể thử ghép lại.", "warn");
        await this.hangup(); return;
      }
      if (otherId && otherId !== this.remotePeerId) {
        this.remotePeerId = otherId; this.matchStartedAt = 0;
        this.pendingIce = [];
        this.setStatus("Người tham gia đã vào phòng. Đang thiết lập kết nối…");
        if (state.role === "host" && this.pc && !this.pc.localDescription && !this.makingOffer) await this.makeOffer();
      } else if (!otherId && this.remotePeerId) {
        this.remotePeerId = "";
        this.resetRemotePeer();
        this.setStatus("Người còn lại đã rời phòng. Đang chờ người tham gia mới…");
      } else if (!otherId) {
        this.setStatus(this.matchStartedAt ? "Đang ghép ngẫu nhiên… Skeleton và cử chỉ vẫn hoạt động." : "Đang chờ người thứ hai… Hãy gửi đường dẫn mời.");
      }
      for (const message of state.messages || []) await this.handleSignal(message);
      this.refreshMediaButtons();
    } catch (error) {
      if (this.active) this.setStatus(`Mất tín hiệu phòng: ${error.message}. Đang thử kết nối lại…`, "warn");
    } finally {
      this.pollBusy = false;
      this.schedulePoll(this.active ? (this.pc?.connectionState === "connected" ? 650 : 250) : 0);
    }
  }

  startNetworkStats() {
    clearInterval(this.statsTimer);
    this.statsTimer = setInterval(() => void this.updateNetworkStats(), 2000);
    void this.updateNetworkStats();
  }

  async updateNetworkStats() {
    if (!this.pc || this.pc.connectionState !== "connected") return;
    try {
      const report = await this.pc.getStats();
      let rtt = null, jitter = null, lost = 0, received = 0, framesDropped = 0, bytes = 0, candidateType = "?";
      for (const stat of report.values()) {
        if (stat.type === "candidate-pair" && stat.state === "succeeded" && (stat.nominated || stat.selected)) {
          if (Number.isFinite(stat.currentRoundTripTime)) rtt = stat.currentRoundTripTime * 1000;
          const local = report.get(stat.localCandidateId); if (local?.candidateType) candidateType = local.candidateType;
        }
        if (stat.type === "inbound-rtp" && stat.kind === "audio") { if (Number.isFinite(stat.jitter)) jitter = stat.jitter * 1000; lost += stat.packetsLost || 0; received += stat.packetsReceived || 0; }
        if (stat.type === "inbound-rtp" && stat.kind === "video") { bytes += stat.bytesReceived || 0; framesDropped += stat.framesDropped || 0; }
      }
      const now = performance.now();
      const bitrate = this.lastStats && now > this.lastStats.at ? Math.max(0, (bytes - this.lastStats.bytes) * 8 / ((now - this.lastStats.at) / 1000) / 1000) : 0;
      this.lastStats = { at: now, bytes };
      const loss = received + lost > 0 ? (100 * lost / (received + lost)).toFixed(1) : "—";
      const line = `MẠNG · RTT ${rtt == null ? "—" : `${Math.round(rtt)} ms`} · jitter ${jitter == null ? "—" : `${jitter.toFixed(1)} ms`} · mất gói ${loss}% · video ${bitrate.toFixed(0)} kb/s · ICE ${candidateType}`;
      const el = $("meetNetworkStats"); if (el) el.textContent = line;
      const lossRate = received + lost > 0 ? lost / (received + lost) : 0;
      const targetBitrate = lossRate > 0.05 || (rtt != null && rtt > 300) ? 650_000 : 1_500_000;
      for (const sender of this.pc?.getSenders?.() || []) {
        if (sender.track?.kind !== "video") continue;
        try {
          const params = sender.getParameters(); params.encodings = params.encodings?.length ? params.encodings : [{}];
          if (params.encodings[0].maxBitrate !== targetBitrate) { params.encodings[0].maxBitrate = targetBitrate; void sender.setParameters(params).catch(() => {}); }
        } catch {}
      }
    } catch (error) { console.debug("WebRTC stats unavailable", error); }
  }

  async recoverIce(pc) {
    if (!this.active || pc !== this.pc || this.iceRestartAttempts >= 2) {
      if (this.iceRestartAttempts >= 2) this.setStatus("Tự khôi phục đã thử 2 lần. Hãy kết thúc và gọi lại hoặc đổi mạng.", "error");
      return;
    }
    this.iceRestartAttempts++;
    try {
      pc.restartIce?.();
      if (this.role === "host") await this.makeOffer({ iceRestart: true });
      setTimeout(() => {
        if (this.active && this.pc === pc && pc.iceConnectionState === "failed" && this.iceRestartAttempts < 2) void this.recoverIce(pc);
      }, 2500);
    } catch (error) { this.setStatus(`Không khôi phục được ICE: ${error.message}`, "error"); }
  }

  async makeOffer({ iceRestart = false } = {}) {
    if (!this.pc || !this.remotePeerId || this.makingOffer) return;
    this.makingOffer = true;
    try {
      const offer = await this.pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
      await this.pc.setLocalDescription(offer);
      await this.sendSignal("offer", { type: this.pc.localDescription.type, sdp: this.pc.localDescription.sdp });
      this.setStatus("Đã gửi lời mời WebRTC. Đang đàm phán đường truyền…");
    } catch (error) { this.setStatus(`Không tạo được lời mời: ${error.message}`, "error"); }
    finally { this.makingOffer = false; }
  }

  async handleSignal(message) {
    if (!this.active || !message || message.fromPeerId === this.peerId) return;
    if (message.type === "leave") {
      if (this.remotePeerId === message.fromPeerId) {
        this.remotePeerId = ""; this.resetRemotePeer();
      }
      this.setStatus("Người còn lại đã rời phòng. Đang chờ người tham gia mới…");
      return;
    }
    if (this.remotePeerId && this.remotePeerId !== message.fromPeerId) return;
    this.remotePeerId = message.fromPeerId;
    if (!this.pc) {
      const config = await this.api("/api/meet/config");
      await this.createPeerConnection(config.iceServers);
    }
    if (message.type === "offer") {
      await this.pc.setRemoteDescription(new RTCSessionDescription(message.payload));
      await this.flushPendingIce();
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      await this.sendSignal("answer", { type: this.pc.localDescription.type, sdp: this.pc.localDescription.sdp });
    } else if (message.type === "answer") {
      if (this.pc.signalingState === "have-local-offer") {
        await this.pc.setRemoteDescription(new RTCSessionDescription(message.payload));
        await this.flushPendingIce();
      }
    } else if (message.type === "ice") {
      const candidate = message.payload;
      if (!candidate || typeof candidate.candidate !== "string") return;
      if (this.pc.remoteDescription) await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      else if (this.pendingIce.length < 64) this.pendingIce.push(candidate);
    }
  }

  async flushPendingIce() {
    const pending = this.pendingIce.splice(0, this.pendingIce.length);
    for (const candidate of pending) {
      try { await this.pc?.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch (error) { console.warn("Could not apply queued ICE candidate", error); }
    }
  }

  resetRemotePeer() {
    this.closePeerConnection();
    $("remoteVideo").srcObject = null;
    $("remotePlaceholder")?.classList.remove("hidden");
    this.pendingIce = [];
    if (this.active) void this.rebuildPeerConnection();
  }

  async rebuildPeerConnection() {
    try {
      const config = await this.api("/api/meet/config");
      if (this.active && !this.pc) await this.createPeerConnection(config.iceServers);
    } catch (error) { this.setStatus(`Không tạo được kết nối mới: ${error.message}`, "warn"); }
  }

  closePeerConnection() {
    clearInterval(this.statsTimer); this.statsTimer = 0; this.lastStats = null;
    if (this.pc) {
      this.pc.ontrack = this.pc.onicecandidate = this.pc.onconnectionstatechange = this.pc.oniceconnectionstatechange = null;
      try { this.pc.close(); } catch {}
    }
    this.pc = null; this.makingOffer = false;
  }

  stopLocalMedia() {
    this.localStream?.getTracks().forEach(track => track.stop());
    try { const result = this.onLocalStream(null); result?.catch?.(() => {}); } catch {}
    this.localStream = null;
    if ($("localVideo")) $("localVideo").srcObject = null;
    if ($("remoteVideo")) $("remoteVideo").srcObject = null;
    $("remotePlaceholder")?.classList.remove("hidden");
  }

  refreshMediaButtons() {
    const audioOn = !!this.localStream?.getAudioTracks().some(t => t.enabled);
    const videoOn = !!this.localStream?.getVideoTracks().some(t => t.enabled);
    $("toggleMicBtn").textContent = audioOn ? "🎙 Tắt mic" : "🔇 Bật mic";
    $("toggleCameraBtn").textContent = videoOn ? "📷 Tắt camera" : "📷 Bật camera";
    $("toggleMicBtn").classList.toggle("off", !audioOn);
    $("toggleCameraBtn").classList.toggle("off", !videoOn);
  }

  toggleTrack(kind) {
    const tracks = kind === "audio" ? this.localStream?.getAudioTracks() : this.localStream?.getVideoTracks();
    if (!tracks?.length) return;
    const enable = !tracks.some(t => t.enabled);
    for (const track of tracks) track.enabled = enable;
    this.refreshMediaButtons();
  }

  async copyInvite() {
    if (!this.lastInviteUrl) return;
    try {
      await navigator.clipboard.writeText(this.lastInviteUrl);
      this.setStatus("Đã sao chép đường dẫn mời.", "success");
    } catch {
      const input = $("meetInviteUrl"); input?.focus(); input?.select();
      this.setStatus("Không tự sao chép được. Đường dẫn đã được chọn để bạn sao chép thủ công.", "warn");
    }
  }

  async hangup() {
    ++this.connectionGeneration;
    clearTimeout(this.pollTimer); this.pollTimer = 0;
    const roomId = this.roomId, peerId = this.peerId;
    this.active = false; this.pollBusy = false;
    if (roomId && peerId) await this.api(`/api/meet/rooms/${roomId}/leave`, { method: "POST", body: JSON.stringify({ peerId }) }).catch(() => {});
    this.closePeerConnection(); this.stopLocalMedia();
    this.roomId = this.peerId = this.remotePeerId = this.role = "";
    this.pendingIce = []; this.lastInviteUrl = ""; this.turnConfigured = false; this.matchStartedAt = 0;
    $("meetInviteRow").classList.add("hidden");
    $("meetLobby").classList.remove("hidden");
    $("meetCallControls").classList.add("hidden");
    $("meetVideoGrid").classList.add("hidden");
    $("hangupBtn").classList.add("hidden");
    $("hangupBtn").textContent = "☎ Kết thúc cuộc gọi";
    const stats = $("meetNetworkStats"); if (stats) stats.textContent = "MẠNG · Chưa kết nối";
    this.setStatus("Đã kết thúc cuộc gọi.");
  }

  async close() {
    if (!this.opened) return;
    await this.hangup();
    this.opened = false;
    this.overlay?.classList.add("hidden");
    this.overlay?.setAttribute("aria-hidden", "true");
    this.onResumeApp();
  }
}
