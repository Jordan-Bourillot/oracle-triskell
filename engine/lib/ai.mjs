// Cadrage par l'IA : elle REDIGE l'explication en francais clair.
// Regle absolue : l'IA n'invente JAMAIS la probabilite ni un fait chiffre.
// Le pourcentage vient du modele statistique ; l'IA ne fait que mettre
// des mots dessus. Usage 100 % backend (cle jamais envoyee au navigateur).
//
// Resilience facon Triskell : Anthropic -> DeepSeek -> Mistral -> gabarit.
// Si tout echoue, une phrase deterministe garantit que le systeme tourne.

const MODEL = process.env.ORACLE_AI_MODEL || "claude-sonnet-4-6";

async function viaAnthropic(prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 320,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json();
  return (data?.content?.[0]?.text || "").trim() || null;
}

async function viaDeepseek(prompt) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "deepseek-chat",
      max_tokens: 320,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}`);
  const data = await res.json();
  return (data?.choices?.[0]?.message?.content || "").trim() || null;
}

async function viaMistral(prompt) {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) return null;
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "mistral-small-latest",
      max_tokens: 320,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Mistral ${res.status}`);
  const data = await res.json();
  return (data?.choices?.[0]?.message?.content || "").trim() || null;
}

/**
 * Redige l'explication d'une prediction.
 * @param {object} facts  faits structures (chiffres deja calcules)
 * @param {string} fallback  phrase deterministe si toutes les IA echouent
 */
export async function explain(facts, fallback) {
  const prompt =
    "Tu rediges l'explication d'une prediction publique, en francais simple et sobre. " +
    "Regles ABSOLUES : ne donne JAMAIS de pourcentage (il est deja fixe par un modele), " +
    "n'invente aucun chiffre, aucune date, aucun fait. Pas de jargon. " +
    "Explique en 2 a 3 phrases POURQUOI ce niveau de probabilite, a partir des faits fournis. " +
    "Pas de tiret cadratin, pas de deux-points d'annonce, pas de formule marketing.\n\n" +
    "FAITS (deja calcules, ne pas recalculer) :\n" +
    JSON.stringify(facts, null, 2) +
    "\n\nRends UNIQUEMENT le texte d'explication, rien d'autre.";

  for (const provider of [viaAnthropic, viaDeepseek, viaMistral]) {
    try {
      const out = await provider(prompt);
      if (out) return out;
    } catch (err) {
      // on passe au fournisseur suivant
      console.error(`  [ia] ${provider.name} indisponible: ${err.message}`);
    }
  }
  return fallback;
}
