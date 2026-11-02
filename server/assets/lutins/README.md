# Assets lutins — Lutincher

Bibliothèque de fragments SVG assemblés par le moteur de génération (`server/src/lutins/`).
Chaque lutin = un asset par slot, empilé dans l'ordre `z` croissant dans un SVG
`viewBox="0 0 200 200"`.

```
svg/{slot}-{id}.svg   33 fragments (contenu interne, SANS balise <svg> englobante)
manifest.json         slots (id, z, label FR) + assets (id, label FR, rarity) + bloc names
preview.html          outil de contrôle visuel (statique, sans dépendance)
```

## Ordre d'empilement (z)

`background` 0 → `body` 1 → `ears` 2 → `eyes` 3 → `hat` 4 → `accessory` 5.

| Slot | commun | rare | épique | légendaire |
|---|---|---|---|---|
| background | 3 | 1 | 1 | — |
| body | 3 | 1 | 1 | 1 (« Lutin doré ») |
| ears | 3 | 1 | — | — |
| eyes | 4 | 1 | 1 | — |
| hat | 3 (dont `none`) | 2 | 1 | — |
| accessory | 3 (dont `none`) | 2 | 1 | — |

Les assets `hat-none` et `accessory-none` sont des fragments vides (tagués `commun`)
qui permettent de ne rien dessiner sur ces slots.

## Prévisualiser

`preview.html` fetch des fichiers relatifs (`manifest.json`, `svg/…`) : il faut donc
le servir en HTTP, pas l'ouvrir en `file://`. Depuis ce dossier :

```bash
cd server/assets/lutins
python3 -m http.server 8000
# puis ouvrir http://localhost:8000/preview.html
```

La page affiche : une grille de tous les assets par slot (avec silhouette de
référence optionnelle pour vérifier l'alignement), et un lutin aléatoire
re-générable (bouton ou clic sur le lutin). Cliquer un slot le met en
surbrillance et permet de choisir son asset à la main.

## Ajouter un asset

1. Créer `svg/{slot}-{id}.svg` : fragment interne (racine unique `<g>…</g>`),
   sans `<svg>`, `<defs>`, gradient, filtre, texte ni mask. Tout éventuel `id`
   doit être préfixé par l'id de l'asset. ≤ ~1,5 Ko, 2–3 couleurs, flat design.
2. Respecter la zone d'ancrage du slot (canvas 0 0 200 200) :

   | Slot | Zone |
   |---|---|
   | background | plein cadre, motifs discrets hors zone centrale |
   | body | tête cercle (100,90) r=32 ; robe x∈[55,145] jusqu'à y=185 ; ombre y≈188 |
   | ears | attaches latérales ≈ (68,80) et (132,80) |
   | eyes | y∈[82,98], x∈[80,120] |
   | hat | y∈[30,70], largeur ≤ 80, centré x=100 |
   | accessory | x∈[140,195] y∈[120,180] (tenu) ou cou y≈120 |

3. Déclarer l'asset dans `manifest.json`, dans le bon slot :
   `{ "id": "{id}", "label": "Label FR", "rarity": "commun|rare|epique|legendaire" }`
   (l'id ne doit pas contenir le préfixe du slot, ni d'accents).
4. Vérifier le XML + la cohérence fichier ↔ manifest, puis l'alignement dans
   `preview.html` :

```bash
cd server/assets/lutins
python3 -I -c "import xml.etree.ElementTree as ET, glob; [ET.parse(f) for f in glob.glob('svg/*.svg')]"
python3 -I -c "import json, glob; m = json.load(open('manifest.json')); mf = {f\"svg/{s['id']}-{a['id']}.svg\" for s in m['slots'] for a in s['assets']}; files = set(glob.glob('svg/*.svg')); print('manquants:', sorted(mf - files) or 'aucun'); print('orphelins:', sorted(files - mf) or 'aucun')"
```

## Génération des noms

Le bloc `names` du manifest alimente le générateur : nom = `préfixe + cœur`
(+ `suffixe` ~50 % des tirages), ex. « Bergamote des Neiges III ».
