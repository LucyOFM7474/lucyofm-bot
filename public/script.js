const $ = (s) => document.querySelector(s);
const out = $("#out");
const statusBox = $("#status");
let lastAnalysisId = null;

function setOut(text) { out.value = text || ""; }
function setStatus(s) { statusBox.textContent = s || ""; }

$("#go").addEventListener("click", async () => {
  const match = $("#match").value.trim();
  if (!match || !match.includes("-")) {
    setOut("Te rog scrie meciul în format: Gazdă – Oaspeți (cu cratimă).");
    return;
  }
  const [home, away] = match.split("-").map(s => s.trim());

  setOut("Se generează analiza... (poate dura câteva secunde)");
  setStatus("");
  lastAnalysisId = null;

  try {
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homeTeam: home, awayTeam: away })
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok || !data.ok) {
      const err = data?.error || data?.detail || `HTTP ${r.status}`;
      setOut(`Eroare API (${r.status}): ${err}`);
      return;
    }

    setOut(data.analysis || "Fără conținut.");
    lastAnalysisId = data?.saved?.analysisId || null;
    setStatus(`Model: ${data?.meta?.model || "n/a"}${lastAnalysisId ? " • ID: " + lastAnalysisId : ""}`);
  } catch (e) {
    setOut(`Eroare rețea: ${e.message || e}`);
  }
});

$("#voteUp").addEventListener("click", () => sendVote("up"));
$("#voteDown").addEventListener("click", () => sendVote("down"));

async function sendVote(vote) {
  if (!lastAnalysisId) {
    setStatus("Nu există o analiză salvată.");
    return;
  }
  try {
    const r = await fetch("/api/chat", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysisId: lastAnalysisId, vote })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) {
      setStatus(`Eroare la feedback: ${data?.error || "necunoscută"}`);
      return;
    }
    setStatus("Feedback salvat. Mulțumesc!");
  } catch (e) {
    setStatus(`Eroare rețea: ${e.message || e}`);
  }
}
