# L'Oracle

**Des prédictions publiques, précises, datées et chiffrées en probabilité —
jugées par la réalité, en transparence totale.**

Chaque semaine, l'Oracle annonce des prédictions vérifiables sur des événements
à venir. À l'échéance, un programme va chercher le résultat réel sur une source
publique et marque ✅ ou ❌. L'historique est permanent et honnête, les échecs
compris. **La transparence de la calibration est le produit.**

---

## Comment ça marche

1. **Génération** (`engine/generate.mjs`) — pour chaque prédiction : un énoncé
   clair, une probabilité, une date d'échéance et le raisonnement. La probabilité
   vient d'un **modèle statistique** sur données publiques ; une IA rédige
   seulement l'explication en français (elle ne décide jamais du chiffre).

2. **Verrou anti-triche** (`engine/lib/hash.mjs`) — chaque prédiction est
   horodatée et **figée** par une empreinte calculée sur ses champs immuables.
   Modifier l'énoncé, la probabilité ou la date casse l'empreinte. L'historique
   public (commits Git) garde la trace : impossible de réécrire après coup.

3. **Résolution automatique** (`engine/resolve.mjs`) — après l'échéance, le
   résultat réel est récupéré sur une source publique et lié comme preuve.

4. **Tableau de chasse** (`public/`) — taux de réussite, score de Brier, et
   surtout la **courbe de calibration** (« quand je dis 70 %, ai-je raison
   ~70 % du temps ? »). Les échecs restent affichés.

5. **Ça tourne seul** (`.github/workflows/oracle.yml`) — une tâche planifiée
   résout chaque jour et génère chaque lundi, puis publie. Sans intervention.

## Catégories (vérifiables uniquement)

| Catégorie | Donnée | Source publique | Génération | Résolution |
|---|---|---|---|---|
| **Crypto** | prix d'un actif à une date | CoinGecko | marche aléatoire sans dérive (volatilité 90 j) | prix réel relevé |
| **Météo** | température max d'une ville | Open-Meteo | dispersion d'une prévision d'ensemble | relevé observé |

D'autres catégories neutres et vérifiables peuvent s'ajouter (indicateurs
économiques publics, box-office, sport, récompenses). Les sujets touchant la vie
privée, la santé ou la mort de personnes sont **exclus**.

## Vérifier soi-même

```bash
npm run verify     # recalcule toutes les empreintes : aucune prédiction falsifiée ?
node engine/selftest.mjs   # contrôle les calculs et le verrou, sans réseau
```

## Lancer à la main

```bash
npm run generate   # crée un nouveau lot (nécessite .env avec les clés IA)
npm run resolve    # résout les échéances passées
```

## Architecture

```
engine/
  generate.mjs        crée et fige les prédictions
  resolve.mjs         va chercher les résultats réels
  verify.mjs          contrôle d'intégrité public
  selftest.mjs        tests sans réseau
  lib/
    stats.mjs         loi normale, Brier, quantiles (les probabilités)
    hash.mjs          le verrou anti-triche (empreinte sha256)
    ledger.mjs        lecture/écriture du registre, gel
    ai.mjs            rédaction de l'explication (backend uniquement)
    dates.mjs, http.mjs
    sources/          accès aux données publiques (crypto, météo)
    generators/       fabrication des prédictions (crypto, météo)
public/
  index.html, styles.css, app.js
  data/predictions.json   LE registre public (mémoire permanente)
```

## Règle d'or

Le pourcentage n'est jamais une opinion d'IA : il sort d'un modèle. Les clés IA
restent strictement côté backend (jamais dans une page). Rien n'est effacé.
