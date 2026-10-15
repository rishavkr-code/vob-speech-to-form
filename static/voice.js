/* Live voice capture: mic -> AudioWorklet (16 kHz Int16 PCM) -> /ws/deepgram -> transcript events.
   UI-agnostic; app.js owns what happens with the text. */
(function () {
  const PCM_WORKLET = `
class Pcm extends AudioWorkletProcessor {
  constructor() { super(); this.buf = []; }
  process([input]) {
    const ch = input[0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        const v = Math.max(-1, Math.min(1, ch[i]));
        this.buf.push(v < 0 ? v * 0x8000 : v * 0x7fff);
      }
      if (this.buf.length >= 1600) { // 100 ms at 16 kHz
        this.port.postMessage(Int16Array.from(this.buf).buffer);
        this.buf = [];
      }
    }
    return true;
  }
}
registerProcessor("pcm", Pcm);`;

  /**
   * Start a live session.
   * handlers: onOpen(), onInterim(text), onFinal(text), onUtteranceEnd(), onError(message), onClose()
   * Returns { analyser, stop() }.
   */
  async function start({ model = "nova-3", ...h }) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser can't access the microphone.");
    // Browser "call" processing (noise suppression etc.) clips fast/soft syllables and hurts STT.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/deepgram?model=${encodeURIComponent(model)}`);
    ws.binaryType = "arraybuffer";

    // The AudioContext resamples the mic to 16 kHz for us.
    const ctx = new AudioContext({ sampleRate: 16000 });
    await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([PCM_WORKLET], { type: "text/javascript" })));
    const src = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "pcm");
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    src.connect(node);
    src.connect(analyser);

    // Buffer audio until the socket is open so the first words aren't lost.
    const pending = [];
    node.port.onmessage = (e) => (ws.readyState === 1 ? ws.send(e.data) : pending.push(e.data));

    let stopped = false;
    ws.onopen = () => { pending.forEach((b) => ws.send(b)); pending.length = 0; h.onOpen?.(); };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "Error") return h.onError?.(msg.message);
      if (msg.type === "UtteranceEnd") return h.onUtteranceEnd?.();
      if (msg.type !== "Results") return;
      const text = msg.channel.alternatives[0].transcript;
      if (msg.is_final) {
        if (text) h.onFinal?.(text);
        else h.onInterim?.("");
        if (msg.speech_final && text) h.onUtteranceEnd?.();
      } else {
        h.onInterim?.(text);
      }
    };
    ws.onerror = () => { if (!stopped) h.onError?.("Lost connection to the transcription service."); };
    ws.onclose = (e) => {
      if (!stopped && e.reason) h.onError?.(e.reason);
      teardown();
      h.onClose?.();
    };

    function teardown() {
      try { src.disconnect(); node.disconnect(); } catch {}
      stream.getTracks().forEach((t) => t.stop());
      if (ctx.state !== "closed") ctx.close();
    }

    return {
      analyser,
      stop() {
        if (stopped) return;
        stopped = true;
        // Keep the last ~300 ms flowing, then tell the server we're done so Deepgram flushes.
        setTimeout(() => {
          teardown();
          if (ws.readyState === 1) ws.send("stop");
          else if (ws.readyState === 0) ws.close();
        }, 300);
      },
    };
  }

  window.Voice = { start };
})();
