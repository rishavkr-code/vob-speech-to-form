/* Verification of Benefits — dashboard replica + Add Patient modal with live voice fill. */
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const icon = (id, cls = "ic") => `<svg class="${cls}"><use href="#${id}"/></svg>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const FALLBACK_OPTIONS = {
  insurance_provider: ["Aetna", "Anthem Blue Cross", "Blue Cross Blue Shield", "Cigna", "Humana",
    "Kaiser Permanente", "Medicaid", "Medicare", "Tricare", "UnitedHealthcare"],
  provider_name: ["Dr. Barberis", "Dr. Patel", "Dr. Shikha Gupta"],
  clinic: ["Denver Allergy", "Boulder Allergy & Asthma", "Aurora Family Clinic", "Lakewood ENT"],
};
let config = { options: FALLBACK_OPTIONS, stt_models: ["nova-3"] };

/* =============================== Toasts & tooltip =============================== */
function toast(title, { detail = "", kind = "ok", ms = 4200 } = {}) {
  const ic = { ok: "i-check", err: "i-alert", info: "i-sparkles" }[kind];
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.innerHTML = `<span class="t-ic">${icon(ic)}</span><div>${esc(title)}${detail ? `<small>${esc(detail)}</small>` : ""}</div>`;
  $("#toasts").append(el);
  setTimeout(() => { el.classList.add("out"); el.addEventListener("animationend", () => el.remove()); }, ms);
}

(function tooltips() {
  const tip = $("#tooltip");
  let timer;
  document.addEventListener("pointerover", (e) => {
    const t = e.target.closest("[data-tip]");
    if (!t) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      tip.textContent = t.dataset.tip;
      tip.hidden = false;
      const r = t.getBoundingClientRect();
      const w = tip.offsetWidth;
      tip.style.left = `${Math.max(12, Math.min(innerWidth - w - 12, r.left + 36 - w / 2))}px`;
      tip.style.top = `${r.top + r.height * 0.62}px`;
    }, 350);
  });
  document.addEventListener("pointerout", (e) => {
    if (e.target.closest("[data-tip]")) { clearTimeout(timer); tip.hidden = true; }
  });
})();

/* =================================== Table =================================== */
const STATUS = {
  inactive: { label: "Inactive / Not Verified", tone: "red" },
  draft: { label: "In Draft", tone: "green" },
  finalized: { label: "Cost Finalized", tone: "green" },
  pending: { label: "Pending Action", tone: "blue" },
};
const patients = [
  { name: "Emmajoy Bagtas", service: "2029-11-03", verified: "2026-10-14", provider: "", insurance: "Anthem BCBS", status: "inactive" },
  { name: "Robert Barclay", service: "2029-11-03", verified: "2026-10-14", provider: "LINNEA K BUTLER PA-C", insurance: "Anthem BCBS", status: "draft" },
  { name: "Kelsey Rose Botkin", service: "2029-11-03", verified: "2026-10-14", provider: "", insurance: "Anthem BCBS", status: "inactive" },
  { name: "Sherrelyn Bown", service: "2029-11-03", verified: "2026-10-14", provider: "", insurance: "Anthem BCBS", status: "draft" },
  { name: "Reese K Burton", service: "2029-11-03", verified: "2026-10-14", provider: "", insurance: "Anthem BCBS", status: "draft" },
  { name: "Teresa M Carrasco", service: "2029-11-03", verified: "2026-10-14", provider: "NICOLE E BARBERIS MD", insurance: "Anthem BCBS", status: "finalized" },
  { name: "Marcus Delgado", service: "2029-10-30", verified: "2026-10-13", provider: "ANIL PATEL MD", insurance: "Aetna", status: "pending" },
  { name: "Hannah Whitfield", service: "2029-10-28", verified: "2026-10-12", provider: "SHIKHA GUPTA MD", insurance: "UnitedHealthcare", status: "finalized" },
];
const fmtDate = (iso) => iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
const initials = (name) => { const p = name.trim().split(/\s+/); return (p[0][0] + (p.length > 1 ? p.at(-1)[0] : "")).toUpperCase(); };
let statusFilter = null;

function renderRows(freshName) {
  const q = $("#search").value.trim().toLowerCase();
  const rows = patients.filter((p) => (!statusFilter || p.status === statusFilter) && (!q || p.name.toLowerCase().includes(q)));
  $("#rows").innerHTML = rows.map((p) => {
    const s = STATUS[p.status];
    return `<tr class="${p.name === freshName ? "fresh" : ""}">
      <td><div class="pname"><span class="ini ${s.tone}">${initials(p.name)}</span><span class="pii-val">${esc(p.name)}</span></div></td>
      <td>${fmtDate(p.service)}</td>
      <td>${fmtDate(p.verified)}</td>
      <td>${p.provider ? esc(p.provider) : "—"}</td>
      <td>${esc(p.insurance)}</td>
      <td><span class="pill ${p.status}">${s.label}</span></td>
      <td class="center"><span class="approve" aria-label="Not approved"></span></td>
    </tr>`;
  }).join("");
  $("#empty").hidden = rows.length > 0;
}
$("#search").addEventListener("input", () => renderRows());
$$(".chip").forEach((c) => c.addEventListener("click", () => {
  statusFilter = statusFilter === c.dataset.status ? null : c.dataset.status;
  $$(".chip").forEach((x) => x.classList.toggle("on", x.dataset.status === statusFilter));
  renderRows();
}));
$("#pii").addEventListener("change", (e) => $(".patients").classList.toggle("no-pii", !e.target.checked));

/* =============================== Custom select =============================== */
class Select {
  constructor(root, options) {
    this.root = root;
    this.name = root.dataset.name;
    this.placeholder = root.dataset.placeholder;
    this.options = options;
    this.value = "";
    this.active = -1;
    const iconId = root.dataset.icon || "i-chev-down";
    root.innerHTML = `
      <button type="button" class="sel-trigger" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="${root.getAttribute("aria-labelledby")}">
        <span class="val ph">${esc(this.placeholder)}</span>${icon(iconId, `ic ${iconId === "i-chev-down" ? "chev-d" : ""}`)}
      </button>
      <input type="hidden" name="${this.name}" />`;
    this.trigger = $(".sel-trigger", root);
    this.hidden = $("input", root);
    this.trigger.addEventListener("click", () => (this.menu ? this.close() : this.open()));
    this.trigger.addEventListener("keydown", (e) => this.onKey(e));
    document.addEventListener("pointerdown", (e) => { if (this.menu && !root.contains(e.target)) this.close(); });
  }
  open() {
    this.menu = document.createElement("ul");
    this.menu.className = "sel-menu";
    this.menu.setAttribute("role", "listbox");
    this.menu.innerHTML = this.options.map((o, i) =>
      `<li role="option" data-i="${i}" aria-selected="${o === this.value}">${esc(o)}${icon("i-check")}</li>`).join("");
    this.menu.addEventListener("pointerdown", (e) => e.preventDefault());
    this.menu.addEventListener("click", (e) => { const li = e.target.closest("li"); if (li) this.pick(+li.dataset.i); });
    this.menu.addEventListener("pointermove", (e) => { const li = e.target.closest("li"); if (li) this.highlight(+li.dataset.i, false); });
    this.root.append(this.menu);
    this.trigger.setAttribute("aria-expanded", "true");
    this.highlight(Math.max(0, this.options.indexOf(this.value)));
  }
  close() {
    this.menu?.remove();
    this.menu = null;
    this.trigger.setAttribute("aria-expanded", "false");
  }
  highlight(i, scroll = true) {
    this.active = i;
    $$("li", this.menu).forEach((li, j) => li.classList.toggle("active", j === i));
    if (scroll) this.menu.children[i]?.scrollIntoView({ block: "nearest" });
  }
  pick(i) {
    this.set(this.options[i], { user: true });
    this.close();
    this.trigger.focus();
  }
  onKey(e) {
    if (!this.menu) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); this.open(); }
      return;
    }
    const n = this.options.length;
    if (e.key === "ArrowDown") { e.preventDefault(); this.highlight((this.active + 1) % n); }
    else if (e.key === "ArrowUp") { e.preventDefault(); this.highlight((this.active - 1 + n) % n); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.pick(this.active); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); this.close(); }
    else if (e.key === "Tab") this.close();
    else if (e.key.length === 1) {
      const i = this.options.findIndex((o) => o.toLowerCase().startsWith(e.key.toLowerCase()));
      if (i >= 0) this.highlight(i);
    }
  }
  set(v, { user = false } = {}) {
    this.value = v || "";
    this.hidden.value = this.value;
    const val = $(".val", this.trigger);
    val.textContent = this.value || this.placeholder;
    val.classList.toggle("ph", !this.value);
    this.root.dispatchEvent(new CustomEvent("change", { bubbles: true, detail: { user } }));
  }
}

/* =============================== Add Patient modal =============================== */
const form = $("#form");
const overlay = $("#overlay");
const selects = {};
const FIELD_NAMES = ["first_name", "last_name", "insurance_provider", "policy_number", "date_of_birth",
  "service_date", "provider_name", "clinic", "appointment_type", "phone_number", "email"];
const LABELS = { first_name: "First name", last_name: "Last name", insurance_provider: "Insurance", policy_number: "Policy #",
  date_of_birth: "Date of birth", service_date: "Service date", provider_name: "Provider", clinic: "Clinic",
  appointment_type: "Appointment", phone_number: "Phone", email: "Email" };

function buildSelects() {
  $$(".select", form).forEach((root) => { selects[root.dataset.name] = new Select(root, config.options[root.dataset.name] || []); });
}
const fieldEl = (name) => (selects[name] ? selects[name].root : form.elements[name]).closest(".field");
const getValue = (name) => (selects[name] ? selects[name].value : form.elements[name].value) || null;
const currentValues = () => Object.fromEntries(FIELD_NAMES.map((n) => [n, getValue(n)]));

function syncPolicy() {
  const p = form.elements.policy_number;
  p.disabled = !selects.insurance_provider.value && !p.value;
  p.placeholder = p.disabled ? "Select insurance provider first" : "e.g. W123456789";
}
function syncDates() {
  $$('input[type="date"]', form).forEach((d) => d.classList.toggle("has-value", !!d.value));
}

form.addEventListener("change", (e) => {
  if (e.target.closest?.('[data-name="insurance_provider"]')) syncPolicy();
  syncDates();
  e.target.closest?.(".field")?.classList.remove("invalid");
});
form.addEventListener("input", (e) => {
  const f = e.target.closest(".field");
  f?.classList.remove("invalid", "ai", "ai-done");
  syncDates();
});
$$(".date-wrap").forEach((w) => w.addEventListener("click", () => { try { $("input", w).showPicker(); } catch {} }));

let lastFocus = null;
function openModal() {
  lastFocus = document.activeElement;
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => form.elements.first_name.focus(), 60);
}
function closeModal() {
  if (voice.active) voice.stop({ silent: true });
  overlay.classList.add("closing");
  setTimeout(() => {
    overlay.hidden = true;
    overlay.classList.remove("closing");
    document.body.style.overflow = "";
    resetForm();
    lastFocus?.focus();
  }, 190);
}
function resetForm() {
  form.reset();
  Object.values(selects).forEach((s) => s.set(""));
  $$(".field", form).forEach((f) => f.classList.remove("invalid", "ai", "ai-done"));
  voice.reset();
  syncPolicy();
  syncDates();
}
$("#open-add").addEventListener("click", openModal);
$("#close").addEventListener("click", closeModal);
$("#cancel").addEventListener("click", closeModal);
overlay.addEventListener("pointerdown", (e) => { if (e.target === overlay) closeModal(); });
document.addEventListener("keydown", (e) => {
  if (overlay.hidden) return;
  if (e.key === "Escape") { e.preventDefault(); voice.active ? voice.stop() : closeModal(); }
  if (e.key === "Tab") {  // keep focus inside the dialog
    const f = $$('button:not([disabled]), input:not([disabled]):not([type="hidden"]), [tabindex="0"]', $(".modal"))
      .filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
    else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
  }
});
$$("[data-soon]").forEach((b) => b.addEventListener("click", () =>
  toast("Image auto-fill isn't part of this demo", { detail: "Try Fill by voice instead.", kind: "info" })));

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const missing = ["first_name", "last_name", "insurance_provider", "policy_number", "date_of_birth", "service_date"]
    .filter((n) => !getValue(n));
  if (missing.length) {
    missing.forEach((n) => { const f = fieldEl(n); f.classList.remove("invalid"); void f.offsetWidth; f.classList.add("invalid"); });
    toast(`${missing.length} required field${missing.length > 1 ? "s" : ""} missing`, {
      detail: missing.map((n) => LABELS[n]).join(", "), kind: "err" });
    return;
  }
  const v = currentValues();
  const name = `${v.first_name} ${v.last_name}`;
  patients.unshift({
    name, service: v.service_date, verified: new Date().toISOString().slice(0, 10),
    provider: (v.provider_name || "").toUpperCase(), insurance: v.insurance_provider, status: "draft",
  });
  statusFilter = null;
  $$(".chip").forEach((x) => x.classList.remove("on"));
  $("#search").value = "";
  renderRows(name);
  closeModal();
  toast(`${name} added`, { detail: "Benefits inquiry started · In Draft" });
});

/* ================================ Voice fill ================================ */
const voice = (() => {
  const card = $("#autofill");
  const tEl = $("#transcript");
  const statusEl = $("#live-status");
  const canvas = $("#wave");
  let session = null, finals = [], interim = "", t0 = 0, tick = null, raf = null;
  let inflight = false, queued = false, debounce = null, filledThisSession = new Set();
  let gen = 0;               // bumps on reset, so a late response can't touch a cleared form
  let sid = 0;               // bumps per session, so a previous session's late events are ignored
  let finalPending = false;  // a "Done" click is waiting for its last extraction
  const levels = [];
  const EXAMPLE_HINT = tEl.innerHTML;

  function setStatus(html) { statusEl.innerHTML = html; }

  function renderTranscript() {
    if (!finals.length && !interim) return;
    tEl.innerHTML = finals.map((f) => `<span class="w">${esc(f)} </span>`).join("")
      + (interim ? `<span class="interim">${esc(interim)}</span>` : "");
    tEl.scrollTop = tEl.scrollHeight;
  }

  function draw() {
    const dpr = devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    if (session?.analyser) {
      const buf = new Float32Array(session.analyser.fftSize);
      session.analyser.getFloatTimeDomainData(buf);
      let sum = 0; for (const x of buf) sum += x * x;
      const rms = Math.sqrt(sum / buf.length);
      levels.push(Math.min(1, Math.pow(rms * 9, 0.75)));
    } else levels.push(0);
    const bar = 3, gap = 3, n = Math.floor(w / (bar + gap));
    while (levels.length > n) levels.shift();
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, "rgba(74,222,128,.15)");
    grad.addColorStop(0.55, "rgba(74,222,128,.75)");
    grad.addColorStop(1, "#a7f3c5");
    g.fillStyle = grad;
    const start = w - levels.length * (bar + gap);
    levels.forEach((lv, i) => {
      const bh = Math.max(3, lv * (h - 6));
      const x = start + i * (bar + gap);
      g.beginPath();
      g.roundRect(x, (h - bh) / 2, bar, bh, 1.5);
      g.fill();
    });
    raf = requestAnimationFrame(draw);
  }

  function schedule() { clearTimeout(debounce); debounce = setTimeout(run, 120); }

  async function run() {
    const transcript = finals.join(" ").trim();
    if (!transcript) return;
    if (inflight) { queued = true; return; }
    inflight = true;
    const myGen = gen;
    setStatus(`<span class="spin"></span>Updating form…`);
    const started = performance.now();
    try {
      const r = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, current: currentValues(), today: localDate() }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      if (myGen !== gen) return;
      const changed = apply(body.fields);
      const secs = ((performance.now() - started) / 1000).toFixed(1);
      setStatus(changed.length
        ? `${icon("i-check", "ic ok")}<span><b>${changed.length}</b> field${changed.length > 1 ? "s" : ""} updated · ${secs}s</span>`
        : `<span>Listening for details…</span>`);
    } catch (e) {
      if (myGen !== gen) return;
      setStatus(`<span style="color:#ff8a96">Couldn't update the form</span>`);
      toast("Couldn't update the form from speech", { detail: e.message.slice(0, 140), kind: "err" });
    } finally {
      inflight = false;
      if (myGen === gen) {
        if (queued) { queued = false; run(); }
        else if (finalPending && !session) { finalPending = false; finish(); }
      }
    }
  }

  function apply(fields) {
    const changed = [];
    for (const name of FIELD_NAMES) {
      const v = fields[name];
      if (v == null || v === getValue(name)) continue;
      if (selects[name]) {
        if (!selects[name].options.includes(v)) continue;
        selects[name].set(v);
      } else {
        const el = form.elements[name];
        el.disabled = false;
        el.value = v;
      }
      changed.push(name);
      filledThisSession.add(name);
      const f = fieldEl(name);
      if (!$(".ai-tag", f)) f.insertAdjacentHTML("beforeend", `<span class="ai-tag">${icon("i-sparkles")}Voice</span>`);
      f.classList.remove("invalid", "ai", "ai-done");
      void f.offsetWidth;
      f.classList.add("ai");
      setTimeout(() => { if (f.classList.contains("ai")) { f.classList.remove("ai"); f.classList.add("ai-done"); } }, 2200);
    }
    syncPolicy();
    syncDates();
    return changed;
  }

  async function start() {
    if (session) return;
    finals = []; interim = ""; levels.length = 0; filledThisSession = new Set();
    tEl.innerHTML = EXAMPLE_HINT;
    card.classList.add("live", "connecting");
    $("#live-state").textContent = "Connecting";
    setStatus("");
    const my = ++sid;
    const mine = (fn) => (...a) => { if (my === sid) fn(...a); };
    try {
      const s = await Voice.start({
        model: config.stt_models[0],
        onOpen: mine(() => {
          card.classList.remove("connecting");
          $("#live-state").textContent = "Listening";
          t0 = Date.now();
          tick = setInterval(() => {
            const s = Math.floor((Date.now() - t0) / 1000);
            $("#timer").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
          }, 250);
        }),
        onInterim: mine((text) => { interim = text; renderTranscript(); }),
        onFinal: mine((text) => { finals.push(text); interim = ""; renderTranscript(); }),
        onUtteranceEnd: mine(schedule),
        onError: mine((msg) => { if (session) { toast("Voice input stopped", { detail: msg, kind: "err" }); stop(); } }),
        onClose: mine(() => { if (session) stop(); }),
      });
      if (my !== sid) return s.stop();  // reset/closed while connecting
      session = s;
      $("#timer").textContent = "0:00";
      draw();
    } catch (e) {
      card.classList.remove("live", "connecting");
      session = null;
      const denied = e.name === "NotAllowedError" || e.name === "SecurityError";
      toast(denied ? "Microphone access was blocked" : "Couldn't start voice input", {
        detail: denied ? "Allow microphone access for this site in your browser, then try again." : e.message, kind: "err" });
    }
  }

  function stop({ silent = false } = {}) {
    if (!session) return;
    const s = session;
    session = null;
    s.stop();
    clearInterval(tick);
    $("#live-state").textContent = "Finishing";
    card.classList.add("connecting");
    if (silent) return finish({ quiet: true });
    // Give Deepgram a moment to flush the last words, then run a final extraction.
    finalPending = true;
    const myGen = gen;
    setTimeout(() => {
      if (myGen !== gen) return;
      interim = ""; renderTranscript();
      if (!finals.length) { finalPending = false; finish(); }
      else if (inflight) queued = true;  // the running request's finally picks this up
      else run();
    }, 900);
  }

  function finish({ quiet = false } = {}) {
    cancelAnimationFrame(raf);
    card.classList.remove("live", "connecting");
    const n = filledThisSession.size;
    if (n && !quiet) toast(`Filled ${n} field${n > 1 ? "s" : ""} from voice`, { detail: "Review the highlighted fields before adding the patient." });
  }

  function reset() {
    if (session) stop({ silent: true });
    gen++; sid++;
    clearTimeout(debounce);
    finals = []; interim = ""; queued = false; finalPending = false;
    card.classList.remove("live", "connecting");
    tEl.innerHTML = EXAMPLE_HINT;
  }

  $("#voice-start").addEventListener("click", start);
  $("#voice-stop").addEventListener("click", () => stop());
  return { start, stop, reset, get active() { return !!session; } };
})();

// The user's own date, so "tomorrow" resolves correctly when the server runs in UTC.
function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ==================================== Init ==================================== */
(async function init() {
  renderRows();
  try {
    const r = await fetch("/api/config");
    if (r.ok) {
      config = await r.json();
      if (!config.deepgram_configured) toast("Speech-to-text isn't configured on the server", { kind: "err" });
      if (!config.anthropic_configured) toast("Form extraction isn't configured on the server", { kind: "err" });
    }
  } catch { /* offline: fall back to the bundled option lists */ }
  buildSelects();
  syncPolicy();
  syncDates();
})();
