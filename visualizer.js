/* =========================================================
 * 알로소의 하루 - 원형 음성 비주얼라이저
 * ---------------------------------------------------------
 * canvas에 시리/HUD 느낌의 원형 오디오 바를 그린다.
 * - 마이크 접근이 가능하면 실제 음량(AnalyserNode)에 반응
 * - 불가능하면 부드러운 맥동 fallback 애니메이션
 * ========================================================= */

function createVisualizer(canvas) {
  const ctx = canvas.getContext("2d");
  let raf = null;
  let analyser = null;
  let audioCtx = null;
  let source = null;
  let stream = null;
  let dataArray = null;
  let running = false;
  let t = 0;

  const BARS = 72; // 원을 둘러싼 막대 수

  function fitCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = canvas.clientWidth || 300;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  async function connectMic() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;
      source.connect(analyser);
      dataArray = new Uint8Array(analyser.frequencyBinCount);
      return true;
    } catch (_) {
      analyser = null; // fallback 모드
      return false;
    }
  }

  function levels() {
    // 각 막대의 0~1 크기를 반환
    const out = new Array(BARS);
    if (analyser) {
      analyser.getByteFrequencyData(dataArray);
      const n = dataArray.length;
      for (let i = 0; i < BARS; i++) {
        // 저주파에 가중치를 두어 자연스럽게
        const idx = Math.floor((i / BARS) * (n * 0.7));
        out[i] = Math.min(1, (dataArray[idx] / 255) * 1.25);
      }
    } else {
      // fallback: 사인파 조합으로 살아있는 듯한 맥동
      for (let i = 0; i < BARS; i++) {
        const a = Math.sin(t * 0.06 + i * 0.5) * 0.5 + 0.5;
        const b = Math.sin(t * 0.11 + i * 0.27) * 0.5 + 0.5;
        out[i] = 0.18 + (a * 0.55 + b * 0.45) * 0.5;
      }
    }
    return out;
  }

  function draw() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const cx = w / 2, cy = h / 2;
    const baseR = Math.min(w, h) * 0.30;
    const maxBar = Math.min(w, h) * 0.17;

    ctx.clearRect(0, 0, w, h);
    const vals = levels();

    for (let i = 0; i < BARS; i++) {
      const ang = (i / BARS) * Math.PI * 2 - Math.PI / 2;
      const v = vals[i];
      const len = 6 + v * maxBar;

      const x1 = cx + Math.cos(ang) * baseR;
      const y1 = cy + Math.sin(ang) * baseR;
      const x2 = cx + Math.cos(ang) * (baseR + len);
      const y2 = cy + Math.sin(ang) * (baseR + len);

      // 색: 안쪽 시안 → 바깥 블루, 음량 높으면 밝게
      const alpha = 0.35 + v * 0.65;
      const grad = ctx.createLinearGradient(x1, y1, x2, y2);
      grad.addColorStop(0, `rgba(56,225,255,${alpha})`);
      grad.addColorStop(1, `rgba(79,140,255,${alpha * 0.7})`);

      ctx.strokeStyle = grad;
      ctx.lineWidth = Math.max(2, (Math.PI * 2 * baseR) / BARS * 0.45);
      ctx.lineCap = "round";
      ctx.shadowColor = "rgba(56,225,255,0.6)";
      ctx.shadowBlur = 6 + v * 10;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    t++;
    raf = requestAnimationFrame(draw);
  }

  return {
    async start() {
      if (running) return;
      running = true;
      fitCanvas();
      window.addEventListener("resize", fitCanvas);
      await connectMic();
      if (audioCtx && audioCtx.state === "suspended") {
        try { await audioCtx.resume(); } catch (_) {}
      }
      draw();
    },
    stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", fitCanvas);
      if (stream) stream.getTracks().forEach((tr) => tr.stop());
      if (audioCtx) { try { audioCtx.close(); } catch (_) {} }
      analyser = null; audioCtx = null; source = null; stream = null;
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    }
  };
}
