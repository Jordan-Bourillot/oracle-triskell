// Source CRYPTO : prix publics via CoinGecko (aucune cle requise).
// Sert a la fois a generer (historique 90 j -> volatilite + prix actuel)
// et a resoudre (prix reel a une date donnee).

import { getJson, pause } from "../http.mjs";

const API = "https://api.coingecko.com/api/v3";

// Actifs suivis (id CoinGecko -> nom affiche).
export const ASSETS = {
  bitcoin: { label: "Bitcoin", symbol: "BTC" },
  ethereum: { label: "Ethereum", symbol: "ETH" },
  solana: { label: "Solana", symbol: "SOL" },
};

/**
 * Historique journalier sur N jours.
 * @returns {Promise<Array<{t:number, price:number}>>} t en ms epoch
 */
export async function dailyHistory(id, days = 90) {
  const url = `${API}/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=daily`;
  const data = await getJson(url, { baseDelay: 4000, retries: 5 });
  if (!data?.prices?.length) throw new Error(`CoinGecko: pas de prix pour ${id}`);
  return data.prices.map(([t, price]) => ({ t, price }));
}

/** Dernier prix connu (= prix actuel au moment de la generation). */
export async function currentPrice(id) {
  const hist = await dailyHistory(id, 2);
  return hist[hist.length - 1].price;
}

/**
 * Prix reel le plus proche d'un instant donne (pour la RESOLUTION).
 * On prend une fenetre autour de la date et on choisit le point le
 * plus proche du timestamp vise.
 * @param {string} id
 * @param {number} targetMs  instant vise (ms epoch)
 * @returns {Promise<{price:number, at:number, sourceUrl:string}>}
 */
export async function priceAt(id, targetMs) {
  const from = Math.floor((targetMs - 36 * 3600 * 1000) / 1000); // -36 h
  const to = Math.floor((targetMs + 36 * 3600 * 1000) / 1000); //  +36 h
  const sourceUrl = `${API}/coins/${id}/market_chart/range?vs_currency=usd&from=${from}&to=${to}`;
  await pause(1500);
  const data = await getJson(sourceUrl, { baseDelay: 4000, retries: 5 });
  if (!data?.prices?.length) throw new Error(`CoinGecko: pas de prix autour de la date pour ${id}`);
  let best = data.prices[0];
  let bestGap = Math.abs(best[0] - targetMs);
  for (const p of data.prices) {
    const gap = Math.abs(p[0] - targetMs);
    if (gap < bestGap) {
      best = p;
      bestGap = gap;
    }
  }
  return { price: best[1], at: best[0], sourceUrl };
}
