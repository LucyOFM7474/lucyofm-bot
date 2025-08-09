const $ = (s) => document.querySelector(s);
const frm = $("#frm");
const out = $("#out");
const meta = $("#meta");
const btn = $("#go");
const urlsEl = $("#urls");
const like = $("#like");
const dislike = $("#dislike");
const copyBtn = $("#copy");
const feedback = $("#feedback");

const LS_KEY = "lucyofm_feedback";

frm.addEventListener("submit", async (e) => {
  e.preventDefault();
  btn.disabled = true;
  out.textContent = "Se generează analiza...";
  meta.textContent = "";
  feedback.textContent = "";

  const home = $("#home").value.trim();
  const away = $("#away").value.trim();
  const when = $("#when").value.trim();
  const urlsRaw = urlsEl.value.trim();
  const urls = urlsRaw ? urlsRaw.split(/\n+/).map(s => s.trim()).filter(Boolean) : [];

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ home, away, when, urls })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Eroare API");

    out.textContent = data.analysis || "(fără conținut)";
    const srcList = (data.usedUrls || []).map(u => `• ${u}`).join("\n");
    meta.textContent = `Surse folosite (${(data.usedUrls || []).length}):\n${srcList}`;
  } catch (err) {
    out.textContent = `Eroare: ${String(err)}`;
  } finally {
    btn.disabled = false;
  }
});

like.addEventListener("click", () => saveFeedback(true));
dislike.addEventListener("click", () => saveFeedback(false));

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(out.textContent || "");
    feedback.textContent = "Analiza a fost copiată în clipboard.";
  } catch {
    feedback.textContent = "Nu am putut copia conținutul.";
  }
});

function saveFeedback(positive) {
  const entry = {
    ts: Date.now(),
    positive,
    sample: (out.textContent || "").slice(0, 160)
  };
  const arr = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  arr.push(entry);
  localStorage.setItem(LS_KEY, JSON.stringify(arr));
  feedback.textContent = positive ? "Feedback salvat: 👍" : "Feedback salvat: 👎";
}
