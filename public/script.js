// public/script.js – complet, cu fix pentru HTTP 400

async function generateAnalysis() {
  const btn = document.getElementById('genBtn');
  const out = document.getElementById('output');
  const raw = document.getElementById('matchInput').value || "";

  // Acceptă "-" sau "–", cu sau fără spații
  const parts = raw.split(/[-–]/).map(s => s.trim()).filter(Boolean);
  if (parts.length !== 2) {
    out.value = "Format invalid. Scrie exact: Gazdă - Oaspete (ex: FC Copenhaga - Aarhus).";
    return;
  }
  const [homeTeam, awayTeam] = parts;

  btn.disabled = true;
  out.value = "Se generează analiza...";

  try {
    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        homeTeam,
        awayTeam,
        league: "",
        date: "",
        localeDate: "",
        extraNote: "",
        model: "gpt-4o-mini"
      })
    });

    const data = await resp.json();
    if (!resp.ok) {
      out.value = `Eroare API (${resp.status}): ${data.error || "necunoscută"}`;
      return;
    }

    out.value = data.analysis || "Nu s-a generat conținut.";
  } catch (e) {
    out.value = "Eroare de rețea: " + (e?.message || e);
  } finally {
    btn.disabled = false;
  }
}

// Pornirea generării la apăsarea Enter în câmpul de meci
document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById('matchInput');
  if (input) {
    input.addEventListener('keypress', (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        generateAnalysis();
      }
    });
  }
});
