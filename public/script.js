// public/script.js (fără dată)
const $ = (sel) => document.querySelector(sel);
const statusEl = $("#status");
const outEl = $("#analysis");
const fbBox = $("#feedbackBox");
const matchEl = $("#match");
const analyzeBtn = $("#analyzeBtn");

function setStatus(msg) { statusEl.textContent = msg || ""; }
function setOutput(text) { outEl.textContent = text || ""; }

async function callChat(match) {
  const resp = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ match })
  });
  if (!resp.ok) {
    let err;
    try { err = await resp.json(); } catch {}
    throw new Error(err?.details || `HTTP ${resp.status}`);
  }
  return resp.json();
}

analyzeBtn?.addEventListener("click", async () => {
  const match = (matchEl.value || "").trim();
  if (!match) {
    setStatus("Introdu un meci în formatul „Gazde - Oaspeți”.");
    return;
  }
  setStatus("Se colectează sursele… apoi întreabă GPT-5…");
  setOutput("");
  fbBox.hidden = true;
  analyzeBtn.disabled = true;

  try {
    const data = await callChat(match);
    setStatus(`Model: ${data.model} • ${data.match}`);
    setOutput(data.analysis || "(fără text)");
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
