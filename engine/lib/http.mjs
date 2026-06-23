// Acces reseau robuste : reessaie poliment quand une API publique
// repond "trop de requetes" (429) ou tombe en erreur passagere.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch JSON avec reessais et backoff exponentiel.
 * @param {string} url
 * @param {object} [opts]
 * @param {number} [opts.retries=4]
 * @param {number} [opts.baseDelay=1500] ms
 * @param {object} [opts.headers]
 */
export async function getJson(url, opts = {}) {
  const { retries = 4, baseDelay = 1500, headers = {} } = opts;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "oracle-bot/1.0", ...headers },
      });
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.ok) {
        throw Object.assign(new Error(`HTTP ${res.status} sur ${url}`), { fatal: true });
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (err.fatal || attempt === retries) break;
      const wait = baseDelay * 2 ** attempt + Math.floor(Math.random() * 400);
      await sleep(wait);
    }
  }
  throw lastErr;
}

/** Petite pause volontaire entre deux appels a la meme API (politesse). */
export const pause = sleep;
