// public/script.js
const $ = (sel) => document.querySelector(sel);
const statusEl = $("#status");
const outEl = $("#analysis");
const fbBox = $("#feedbackBox");
const matchEl = $("#match");
const dateEl = $("#date");
const analyzeBtn = $("#analyzeBtn");

function setStatus(msg) {
  statusEl.textContent = msg || "";
}
function setOutput(text) {
  outEl.textContent = text || "";
}

async function callChat(match, date) {
  const body = { match };
  if (date) body.date = date;

  const resp = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await safeJson(resp);
    throw new Error(err?.details || `HTTP ${resp.status}`);
  }
  return resp.json();
}

async function safeJson(resp) {
  try { return await resp.json(); } catch { return null; }
}

analyzeBtn?.addEventListener("click", async () => {
  const match = (matchEl.value || "").trim();
  const date = (dateEl.value || "").trim();

  if (!match) {
    setStatus("Introdu un meci în formatul „Gazde - Oaspeți”.");
    return;
  }

  setStatus("Se colectează sursele… apoi întreabă GPT-5…");
  setOutput("");
  fbBox.hidden = true;
  analyzeBtn.disabled = true;

  try {
    const data = await callChat(match, date);
    setStatus(`Model: ${data.model} • ${data.match}`);
    setOutput(data.analysis || "(fără text)");
    // memorează ultimul meci pt feedback
    fbBox.dataset.match = data.match;
    fbBox.hidden = false;
  } catch (e) {
    console.error(e);
    setStatus("Eroare: " + e.message);
    setOutput("");
  } finally {
    analyzeBtn.disabled = false;
  }
});

fbBox?.addEventListener("click", async (ev) => {
  const btn = ev.target.closest("button");
  if (!btn) return;
  const feedback = btn.getAttribute("data-fb");
  const match = fbBox.dataset.match;
  if (!match) return;

  try {
    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "feedback", match, feedback })
    });
    if (resp.ok) setStatus(`Feedback salvat: ${feedback}`);
  } catch {
    setStatus("Nu am putut salva feedback-ul.");
  }
});
