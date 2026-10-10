// Fifteen low-cost, deterministic specialist managers. They are rule-based supervisors,
// not fifteen extra neural networks; all observe summaries off the inference hot path.
const SPECS = [
  ['camera', 'Camera & capture', m => m.cameraFps > 0 && m.cameraFps < 24 ? ['WARN','Camera FPS thấp; kiểm tra camera constraints và tải thiết bị'] : ['OK','Frame camera đang đáp ứng mục tiêu']],
  ['model', 'Inference model', m => m.aiP95 > 45 ? ['WARN','Inference P95 cao; thử model B hoặc giảm input, giữ fallback'] : ['OK','Inference trong ngân sách mục tiêu']],
  ['scheduler', 'Latest-frame scheduler', m => m.ageP95 > 100 || m.droppedRate > .45 ? ['WARN','Kết quả cũ; ưu tiên frame mới nhất, kiểm tra hàng đợi và capture time'] : ['OK','Không thấy backlog lớn']],
  ['tracking', 'Landmark tracking', m => m.missRate > .30 ? ['WARN','Tỷ lệ mất tay cao; xem ánh sáng, vùng tay và model'] : ['OK','Tracking ổn định theo mẫu gần đây']],
  ['smoothing', 'Motion smoothing', m => m.speed > 1.3 ? ['ADAPT','Tăng phản hồi khi tay di chuyển nhanh'] : m.speed < .22 ? ['ADAPT','Tăng giảm rung khi tay gần đứng yên'] : ['OK','Lọc theo tốc độ One Euro']],
  ['identity', 'Hand identity', m => m.handsFlips > 2 ? ['WARN','Có khả năng đổi slot; kiểm tra giao nhau hai tay'] : ['OK','Chưa có dấu hiệu đổi slot bất thường']],
  ['gestures', 'Gesture detection', m => m.missRate > .4 ? ['WARN','Giảm tin cậy gesture khi tracking yếu'] : ['OK','Gesture dùng cùng timestamp tracking']],
  ['interaction', 'Fingertip interaction', m => m.interactionEnabled && m.clicks > 0 ? ['OK','Click có cooldown chống lặp'] : m.interactionEnabled ? ['INFO','Chạm đầu ngón bật; chưa ghi nhận click'] : ['INFO','Điều khiển bằng đầu ngón đang tắt']],
  ['renderer', 'Canvas renderer', m => m.renderP95 > 8 ? ['WARN','Giảm hiệu ứng vẽ để bảo vệ frame budget'] : ['OK','Render dưới ngưỡng cảnh báo']],
  ['performance', 'Adaptive performance', m => m.perfLevel > 0 ? ['ADAPT',`Đã giảm hiệu ứng cấp ${m.perfLevel}`] : ['OK','Chưa cần giảm hiệu ứng']],
  ['telemetry', 'Latency telemetry', m => m.samples < 8 ? ['WARMUP','Thu thập thêm mẫu P95'] : ['OK','P50/P95/P99 và AGE đang được đo']],
  ['backend', 'Render API', m => m.backend === 'DOWN' ? ['WARN','Backend không phản hồi; tracking cục bộ tiếp tục'] : m.backend === 'WAKING' ? ['INFO','Render có thể đang khởi động'] : ['OK','Backend phản hồi']],
  ['database', 'PostgreSQL', m => m.database === 'error' ? ['WARN','Database lỗi; không gửi bất kỳ việc gì vào đường camera'] : m.database === 'ready' ? ['OK','Database sẵn sàng cho tác vụ phụ'] : ['INFO','Database không cấu hình hoặc đang khởi động']],
  ['jobs', 'Background jobs', m => m.jobs === 'error' ? ['WARN','Không lấy được trạng thái jobs; kiểm tra worker/DB'] : ['OK','Job queue không chặn inference']],
  ['reliability', 'Fallback & recovery', m => m.fallback ? ['WARN','Đang chạy fallback; xem model/delegate và log'] : ['OK','Model chính đang hoạt động']]
];

export class SpecialistAgent {
  constructor(id, name, evaluate) { this.id=id; this.name=name; this.evaluate=evaluate; this.state='WARMUP'; this.message='Đang thu thập dữ liệu'; this.updatedAt=0; this.severity=0; }
  observe(metrics, now=0) {
    const [state, message] = this.evaluate(metrics);
    this.state=state; this.message=message; this.severity=state==='WARN'?2:state==='ADAPT'?1:0; this.updatedAt=now;
    return this.snapshot();
  }
  snapshot() { return { id:this.id, name:this.name, state:this.state, message:this.message, severity:this.severity, updatedAt:this.updatedAt }; }
}

export class SelfReviewAgent {
  review(metrics, agents) {
    const issues=[];
    if (metrics.aiP95 > 45 && metrics.ageP95 > 100) issues.push('Inference và tuổi khung đều cao: giảm tải model trước, không tăng độ phân giải.');
    else if (metrics.aiP95 <= 45 && metrics.ageP95 > 100) issues.push('Inference ổn nhưng khung cũ: ưu tiên lịch frame/capture, không thay model vội.');
    if (metrics.renderP95 > 8 && metrics.perfLevel === 0) issues.push('Render chậm: tắt hiệu ứng trước khi đổi model.');
    if (metrics.missRate > .35 && metrics.aiP95 > 45) issues.push('Độ chính xác và latency cùng xấu: benchmark A/B, không tự chọn model theo tốc độ riêng.');
    if (metrics.backend === 'DOWN' || metrics.database === 'error') issues.push('Backend/database lỗi không được phép ảnh hưởng tracking cục bộ.');
    const warnings=agents.filter(a=>a.state==='WARN').length;
    if (!issues.length) issues.push('Không phát hiện mâu thuẫn lớn; giữ cấu hình bảo thủ và tiếp tục đo.');
    const safe = metrics.renderP95 > 8 ? 'REDUCE_EFFECTS' : metrics.aiP95 > 45 ? 'KEEP_LATEST_AND_BENCHMARK_MODEL' : 'NO_CHANGE_WITHOUT_EVIDENCE';
    this.last={state:warnings>=3?'REVIEW':'CONSISTENT',warnings,issues,safeAction:safe,agentsReviewed:agents.length};
    return this.last;
  }
}

export class AgentOrchestrator {
  constructor() { this.agents=SPECS.map(([id,name,fn])=>new SpecialistAgent(id,name,fn)); this.selfReview=new SelfReviewAgent(); this.last=[]; this.lastReview=null; }
  observe(metrics, now=0) { this.last=this.agents.map(a=>a.observe(metrics,now)); this.lastReview=this.selfReview.review(metrics,this.last); return this.snapshot(); }
  snapshot() { return { agents:this.last.length?this.last:this.agents.map(a=>a.snapshot()), review:this.lastReview||{state:'WARMUP',warnings:0,issues:['Đang chờ mẫu'],safeAction:'NO_CHANGE_WITHOUT_EVIDENCE',agentsReviewed:0} }; }
}

export class ABBenchmark {
  constructor() { this.reset(); }
  reset() { this.runs={mediapipe:{latency:[],detections:0,frames:0,ages:[]},micro:{latency:[],detections:0,frames:0,ages:[]}}; this.active=false; this.phase='IDLE'; this.startedAt=0; this.phaseStartedAt=0; this.finishedAt=0; this.error=''; }
  start(now=0) { this.reset(); this.active=true; this.phase='PREPARING_A'; this.startedAt=now; }
  beginPhase(model,now=0) { this.phase=model==='micro'?'B':'A'; this.phaseStartedAt=now; }
  record(model, {latency=0,detected=false,age=0,now=0}={}) {
    const expected = this.phase === 'A' ? 'mediapipe' : this.phase === 'B' ? 'micro' : null;
    if (!this.active || model !== expected || now-this.phaseStartedAt<1800) return;
    const r=this.runs[model]; if (!r) return; r.frames++; r.latency.push(latency); if(detected) r.detections++; if(Number.isFinite(age)&&age>=0)r.ages.push(age);
  }
  finish(now=0) { this.active=false; this.phase='DONE'; this.finishedAt=now; return this.report(); }
  report() { const one=r=>{ const p=[...r.latency].sort((a,b)=>a-b), a=[...r.ages].sort((a,b)=>a-b), q=x=>x.length?x[Math.min(x.length-1,Math.round(.95*(x.length-1)))]:null; return {samples:r.frames,aiP50:p.length?+(p[Math.floor(.5*(p.length-1))]).toFixed(2):null,aiP95:q(p)==null?null:+q(p).toFixed(2),ageP95:q(a)==null?null:+q(a).toFixed(2),detectionRate:r.frames?+(r.detections/r.frames*100).toFixed(1):null}; }; return {status:this.phase,startedAt:this.startedAt,finishedAt:this.finishedAt||null,mediapipe:one(this.runs.mediapipe),micro:one(this.runs.micro)}; }
}

// A cancellable sleep avoids leaving the A/B promise pending when the user stops the test/camera.
export class InterruptibleWait {
  constructor() { this.timer = null; this.resolvePending = null; }
  sleep(ms) {
    this.cancel();
    return new Promise(resolve => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = null;
        if (this.resolvePending === finish) this.resolvePending = null;
        resolve();
      };
      this.resolvePending = finish;
      this.timer = setTimeout(finish, Math.max(0, ms));
    });
  }
  cancel() {
    const finish = this.resolvePending;
    if (finish) finish();
    else if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.resolvePending = null;
  }
}
