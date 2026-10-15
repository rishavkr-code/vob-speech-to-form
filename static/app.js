const $ = (s) => document.querySelector(s);
const form = $("#form");
const FIELD_NAMES = [...form.elements].map((el) => el.name).filter(Boolean);

let finals = [];          // finalized transcript segments
let interim = "";
let recording = false;
let stopFn = null;        // engine-specific stop
let extractInflight = false;
let extractPending = false;
let speechEndAt = null;   // when the latest utterance ended (for end-to-end timing)

// ---------------- setup ----------------
(async function init() {
  const cfg = await fetch("/api/config").then((r) => r.json());
  for (const [name, opts] of Object.entries(cfg.options)) {
    const sel = form.elements[name];
    for (const o of opts) sel.add(new Option(o, o));
  }
  for (const m of cfg.stt_models) $("#model").add(new Option(m, m));
  for (const m of cfg.extract_models) $("#llm").add(new Option(m, m));
  if (!cfg.openrouter_configured) log("OPENROUTER_API_KEY not set in .env", true);
  if (!cfg.deepgram_configured) log("DEEPGRAM_API_KEY not set in .env", true);
  $("#engine").onchange();
})();

$("#engine").onchange = () => {
  $("#model-ctl").style.display = $("#engine").value === "webspeech" ? "none" : "";
};

form.elements.insurance_provider.addEventListener("change", syncPolicyEnabled);
function syncPolicyEnabled() {
  const p = form.elements.policy_number;
  p.disabled = !form.elements.insurance_provider.value && !p.value;
  p.placeholder = p.disabled ? "Select insurance provider first" : "e.g. W123456789";
}

$("#mic").onclick = () => (recording ? stop() : start());
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !["INPUT", "SELECT"].includes(document.activeElement.tagName)) {
    e.preventDefault();
    $("#mic").click();
  }
});
$("#reset").onclick = () => {
  form.reset();
  syncPolicyEnabled();
  finals = []; interim = "";
  renderTranscript();
  $("#log").innerHTML = "";
};

// ---------------- recording control ----------------
async function start() {
  const engine = $("#engine").value;
  try {
    stopFn = engine === "dg-live" ? await startDeepgramLive() : startWebSpeech();
  } catch (e) {
    log(`start failed: ${e.message}`, true);
    return;
  }
  recording = true;
  $("#mic").classList.add("live");
  $("#mic-label").textContent = "Stop";
  status(`listening (${engine})`);
}

function stop() {
  recording = false;
  $("#mic").classList.remove("live");
  $("#mic-label").textContent = "Start speaking";
  status("idle");
  stopFn?.();
  stopFn = null;
}

async function getMic() {
  // Browser "call" processing (noise suppression etc.) clips fast/soft syllables and hurts STT.
  return navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
}

// --- Deepgram streaming: mic -> AudioWorklet (16 kHz Int16 PCM) -> our WS -> Deepgram ---
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

async function startDeepgramLive() {
  const stream = await getMic();
  const model = $("#model").value;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws/deepgram?model=${encodeURIComponent(model)}`);
  ws.binaryType = "arraybuffer";

  // The AudioContext resamples the mic to 16 kHz for us.
  const ctx = new AudioContext({ sampleRate: 16000 });
  await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([PCM_WORKLET], { type: "text/javascript" })));
  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "pcm");
  // Buffer audio until the socket is open so the first words aren't lost.
  const pending = [];
  node.port.onmessage = (e) => (ws.readyState === 1 ? ws.send(e.data) : pending.push(e.data));
  src.connect(node);

  const openedAt = performance.now();
  let firstWordAt = null;
  ws.onopen = () => { pending.forEach((b) => ws.send(b)); pending.length = 0; };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "Error") return log(msg.message, true);
    if (msg.type === "UtteranceEnd") { speechEndAt ??= performance.now(); return scheduleExtract(); }
    if (msg.type !== "Results") return;
    const text = msg.channel.alternatives[0].transcript;
    if (text && !firstWordAt) {
      firstWordAt = performance.now();
      log(`first words after <b>${Math.round(firstWordAt - openedAt)}ms</b> from mic start`);
    }
    if (msg.is_final) {
      if (text) finals.push(text);
      interim = "";
      if (msg.speech_final && text) { speechEndAt = performance.now(); scheduleExtract(); }
    } else {
      interim = text;
    }
    renderTranscript();
  };
  ws.onclose = (e) => { if (e.reason) log(`ws closed: ${e.reason}`, true); if (recording) stop(); };

  return () => {
    // Keep the last ~300 ms flowing, then tell the server we're done so Deepgram flushes.
    setTimeout(() => {
      src.disconnect();
      node.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      ctx.close();
      if (ws.readyState === 1) ws.send("stop");
    }, 300);
    setTimeout(scheduleExtract, 1500);
  };
}

// --- Browser Web Speech API (Chrome/Edge/Safari only) ---
function startWebSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) throw new Error("Web Speech API not supported in this browser (use Chrome)");
  const sr = new SR();
  sr.continuous = true;
  sr.interimResults = true;
  sr.lang = "en-US";
  sr.onresult = (e) => {
    interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) {
        finals.push(res[0].transcript.trim());
        speechEndAt = performance.now();
        scheduleExtract();
      } else interim += res[0].transcript;
    }
    renderTranscript();
  };
  sr.onerror = (e) => log(`webspeech: ${e.error}`, true);
  sr.onend = () => recording && sr.start(); // Chrome stops after silence; keep going
  sr.start();
  return () => { sr.onend = null; sr.stop(); };
}

// ---------------- extraction ----------------
let debounce;
function scheduleExtract() {
  clearTimeout(debounce);
  debounce = setTimeout(runExtract, 120);
}

async function runExtract() {
  const transcript = finals.join(" ").trim();
  if (!transcript) return;
  if (extractInflight) { extractPending = true; return; }
  extractInflight = true;
  const t0 = performance.now();
  const endAt = speechEndAt;
  speechEndAt = null;
  status("extracting…");
  try {
    const r = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, current: currentValues(), model: $("#llm").value, today: localDate() }),
    }).then((r) => r.json());
    if (r.error) throw new Error(r.error);
    if (r.fallback_reason) log(`fell back to ${r.model.split("/").pop()}: ${r.fallback_reason.slice(0, 120)}`, true);
    const changed = applyFields(r.fields);
    const e2e = endAt ? ` · speech end → filled <b>${Math.round(performance.now() - endAt)}ms</b>` : "";
    log(`${r.model.split("/").pop()} <b>${r.ms}ms</b>${e2e} · ${changed.length ? changed.join(", ") : "no changes"}`);
  } catch (e) {
    log(`extract failed: ${e.message}`, true);
  } finally {
    extractInflight = false;
    status(recording ? "listening" : "idle");
    if (extractPending) { extractPending = false; runExtract(); }
  }
}

function currentValues() {
  return Object.fromEntries(FIELD_NAMES.map((n) => [n, form.elements[n].value || null]));
}

function applyFields(fields) {
  const changed = [];
  for (const name of FIELD_NAMES) {
    const v = fields[name];
    const el = form.elements[name];
    if (v == null || v === el.value) continue;
    if (el.tagName === "SELECT" && ![...el.options].some((o) => o.value === v)) continue;
    el.value = v;
    changed.push(name);
    el.classList.remove("voice-filled");
    void el.offsetWidth; // restart animation
    el.classList.add("voice-filled");
  }
  syncPolicyEnabled();
  return changed;
}

// ---------------- ui helpers ----------------
function renderTranscript() {
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  $("#transcript").innerHTML = esc(finals.join(" ")) + (interim ? ` <span class="interim">${esc(interim)}</span>` : "")
    || '<span class="hint">…</span>';
}

function log(html, err = false) {
  const t = new Date().toLocaleTimeString([], { hour12: false });
  $("#log").insertAdjacentHTML("afterbegin", `<div class="${err ? "err" : ""}">${t} ${html}</div>`);
}

function status(s) { $("#status").textContent = s; }

// The user's own date, so "tomorrow" resolves correctly when the server runs in UTC.
function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
