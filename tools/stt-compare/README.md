# stt-compare

Transcrit un même fichier audio avec Soniox et avec Deepgram, pour comparer la
qualité sur du français. Outil de test isolé : aucun lien avec l'app, aucune
dépendance npm (Node 22 suffit).

## Usage

```bash
export SONIOX_API_KEY=snx_proj_...
export DEEPGRAM_API_KEY=...

cd tools/stt-compare
node compare.js /chemin/vers/cours.wav
```

Un seul fournisseur :

```bash
node compare.js cours.wav --only=soniox
```

Les transcriptions s'affichent côte à côte avec le temps de traitement, et le
JSON brut est écrit dans `stt-compare-<timestamp>.json`.

## Réglages

| Variable | Défaut | Rôle |
|---|---|---|
| `SONIOX_API_KEY` | — | requis pour Soniox |
| `DEEPGRAM_API_KEY` | — | requis pour Deepgram |
| `SONIOX_MODEL` | `stt-async-preview` | modèle Soniox |
| `DEEPGRAM_MODEL` | `nova-2` | modèle Deepgram |
| `STT_LANGUAGE` | `fr` | langue |

Les clés sont lues depuis l'environnement et ne sont jamais écrites sur disque.

## Non vérifié

Le réseau de l'environnement où ce script a été écrit bloque `soniox.com` et
`api.soniox.com`, donc **le chemin Soniox n'a jamais été exécuté**. Sa forme
vient de la documentation publique lue indirectement :

1. `POST /v1/files` (multipart) → `id`
2. `POST /v1/transcriptions` avec `{ file_id, model, language_hints }` → `id`
3. `GET /v1/transcriptions/{id}` jusqu'à `status: "completed"`
4. `GET /v1/transcriptions/{id}/transcript`

Si un nom de champ diffère, le script affiche le corps brut de la réponse HTTP,
ce qui suffit en général à corriger. `stt-async-preview` est un nom de modèle
qui sent le provisoire : vérifie-le dans ta console Soniox et surcharge-le avec
`SONIOX_MODEL` au besoin.

Le chemin Deepgram suit l'API pré-enregistrée standard et reprend les mêmes
paramètres que l'app en streaming, mais n'a pas non plus été exécuté ici.

## Comparer équitablement

- Prends un extrait réel de cours, pas un audio de studio : c'est le bruit de
  salle, le micro éloigné et le débit rapide qui séparent les modèles.
- Deux à cinq minutes suffisent pour juger, et coûtent quelques centimes.
- Regarde en priorité ce qui casse ta fiche IA : noms propres, termes
  techniques, chiffres et formules. Un WER global moyen compte moins qu'une
  date fausse.
- Attention, Deepgram est ici appelé en **pré-enregistré**, alors que l'app
  utilise le **streaming**. La qualité en streaming est généralement un peu
  inférieure — ce test flatte donc légèrement Deepgram par rapport à ce que tu
  obtiens réellement en production.
