// Petites briques statistiques, sans aucune dependance.
// Tout est documente : ce sont elles qui produisent les PROBABILITES.
// (L'IA n'invente jamais un pourcentage ; elle ne fait qu'expliquer.)

/** Moyenne arithmetique. */
export function mean(xs) {
  if (!xs.length) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Ecart-type (echantillon, n-1). */
export function stdev(xs) {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

/**
 * Fonction d'erreur (Abramowitz & Stegun 7.1.26), precision ~1e-7.
 * Sert a calculer la loi normale sans dependance externe.
 */
export function erf(x) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return sign * y;
}

/** Fonction de repartition de la loi normale centree reduite, Phi(z). */
export function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/**
 * Probabilite que le prix final soit >= K, sous une marche aleatoire
 * SANS derive sur le log-prix (hypothese neutre, volatilite estimee).
 *   ln(S_T) ~ Normale( ln(S0), sigma^2 * T )
 *   P(S_T >= K) = Phi( ln(S0/K) / (sigma * sqrt(T)) )
 * @param {number} s0     prix actuel
 * @param {number} k      seuil
 * @param {number} sigma  volatilite journaliere (ecart-type des rendements log)
 * @param {number} tDays  horizon en jours
 */
export function probAboveLognormal(s0, k, sigma, tDays) {
  if (!(s0 > 0) || !(k > 0) || !(sigma > 0) || !(tDays > 0)) return NaN;
  const z = Math.log(s0 / k) / (sigma * Math.sqrt(tDays));
  return normalCdf(z);
}

/**
 * Inverse de la loi normale centree reduite (algorithme de Acklam).
 * Donne le z tel que Phi(z) = p. Sert a choisir un seuil qui vise
 * une probabilite donnee (pour varier les niveaux de proba).
 */
export function invNormalCdf(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let q, r;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - pl) {
    q = p - 0.5;
    r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
}

/** Quantile (interpolation lineaire) d'un tableau de nombres. p dans [0,1]. */
export function quantile(xs, p) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

/** Rendements log journaliers d'une serie de prix. */
export function logReturns(prices) {
  const out = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > 0 && prices[i - 1] > 0) {
      out.push(Math.log(prices[i] / prices[i - 1]));
    }
  }
  return out;
}

/** Borne une probabilite dans [0.02, 0.98] pour eviter les 0%/100% absurdes. */
export function clampProb(p) {
  if (Number.isNaN(p)) return NaN;
  return Math.max(0.02, Math.min(0.98, p));
}

/** Arrondit a l'entier le plus proche en pourcentage. */
export function pct(p) {
  return Math.round(p * 100);
}

/**
 * Score de Brier : moyenne de (proba - resultat)^2.
 * 0 = parfait, 0.25 = pile au hasard a 50%, 1 = pire.
 * @param {Array<{p:number, hit:0|1}>} items  p dans [0,1]
 */
export function brier(items) {
  if (!items.length) return NaN;
  return mean(items.map((it) => (it.p - it.hit) ** 2));
}
