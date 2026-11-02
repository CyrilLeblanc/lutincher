# Plan de développement — Lutincher

Document de coordination : chaque tâche (agent) lit **CAHIER_DES_CHARGES.md** (règles
du jeu, contrat de messages §5) et ce plan (schéma DB, spec assets, conventions,
découpage). Tout écart au plan est signalé dans le rapport de tâche.

## Conventions (non négociables)

- **Minimalisme** : le plus petit code qui satisfait le critère de la fiche. Pas de
  fonctionnalité décorative. Fichiers < ~300 lignes, sinon découper.
- **Langue** : commentaires et identificateurs en **anglais** ; textes UI en
  **français** centralisés (`web/src/ui/strings.ts`).
- **Propreté Rust** : erreurs typées (`thiserror`), pas de `unwrap()` hors tests et
  démarrage, `clippy` sans warning.
- **Propreté TS** : `strict` activé, pas de `!` (non-null assertion), pas de `any`.
- **Dépendances interdites** côté front : pas de lib UI, pas de CSS framework, pas de
  lib d'état. Router `react-router-dom` uniquement.
- **Un agent ne touche QUE les répertoires/files listés dans sa tâche.** Pas de `git
  commit` (l'intégrateur committe).
- Vérification minimale avant de clôturer une tâche : le projet compile/build.

## Layout du dépôt

```
CAHIER_DES_CHARGES.md     règles du jeu + contrat (référence)
docs/PLAN.md              ce fichier
docker-compose.yml        UNE commande : compose up = app complète (exigence fiche)
server/                   API Rust (axum) — crate unique
  src/{main,config,state,error}.rs
  src/routes/             un module par ressource REST
  src/lutins/             moteur de génération SVG
  src/auctions/           moteur d'enchères + escrow
  src/ws/                 hub WebSocket, journal d'événements
  assets/lutins/          assets SVG + manifest.json + names.json (voir spec)
  migrations/             SQL sqlx
web/                      front React TS (Vite, pnpm)
  src/api/                client REST typé
  src/socket/             contract.ts + useAuctionSocket
  src/pages/              une page = un fichier + dossier si composants
  src/components/         composants partagés
  src/ui/strings.ts       textes FR
  src/styles/             tokens + base
```

## Schéma PostgreSQL (migration 0001_init.sql — source de vérité)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player','admin')),
  points_total INTEGER NOT NULL DEFAULT 1000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE lutins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seed BIGINT NOT NULL,
  name TEXT NOT NULL,
  rarity TEXT NOT NULL CHECK (rarity IN ('commun','rare','epique','legendaire')),
  manifest JSONB NOT NULL,          -- {slot_id: asset_id} + meta
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE auctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lutin_id UUID NOT NULL REFERENCES lutins(id),
  start_price INTEGER NOT NULL,
  increment INTEGER NOT NULL DEFAULT 10,
  duration_s INTEGER NOT NULL DEFAULT 90,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','open','ended','cancelled')),
  opened_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  current_amount INTEGER,           -- enchère courante (escrow implicite)
  current_bidder UUID REFERENCES users(id),
  winner_id UUID REFERENCES users(id),
  final_price INTEGER
);

CREATE TABLE bids (
  id BIGSERIAL PRIMARY KEY,
  auction_id UUID NOT NULL REFERENCES auctions(id),
  user_id UUID NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bids_auction_idx ON bids (auction_id, id);

CREATE TABLE events (               -- journal append-only → resync par seq
  seq BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Économie (escrow implicite, minimaliste)** : aucune écriture de fonds pendant
l'enchère. Disponible(u) = `points_total − Σ(current_amount)` sur les ventes `open`
où `current_bidder = u`. À la clôture seulement : `points_total(gagnant) -= final_price`.
Être surenchéri libère donc automatiquement (plus de détenteur sur cette vente).

## Spécification des assets lutins (server/assets/lutins/)

**Canvas** : chaque fragment SVG est un fragment interne (sans `<svg>` englobant),
destiné à un viewBox `0 0 200 200`. Géométrie d'ancrage :

| Zone | Emplacement |
|---|---|
| Fond | plein cadre (0,0,200,200), motifs discrets hors zone centrale |
| Corps | tête : cercle centre (100,90) r=32 ; robe/silhouette : x∈[55,145] jusqu'à y=185 ; ombre au sol y≈188 |
| Oreilles | attaches latérales de la tête ≈ (68,80) et (132,80) |
| Yeux | dans la tête, y∈[82,98], x∈[80,120] |
| Chapeau | posé sur le sommet, y de ~30 à ~70, largeur ≤ 80, centré x=100 |
| Accessoire | zone libre : x∈[140,195] y∈[120,180] (tenu) ou cou y≈120 |

**Style** : flat design, 2-3 couleurs par asset, formes `path/rect/circle/ellipse/polygon`,
pas de gradient/filtre/texte/mask, fichier ≤ ~1.5 Ko. Palette harmonieuse ; le corps
« légendaire » est doré (#F6C445 + accents) — c'est le seul asset `legendaire`.

**Distribution (minimum garanti)** — pour que chaque palier de rareté soit
toujours tirable :

| Slot | commun | rare | épique | particularités |
|---|---|---|---|---|
| background | 3 | 1 | 1 | |
| body | 3 | 1 | 1 | +1 légendaire « doré » |
| ears | 3 | 1 | — | |
| eyes | 4 | 1 | 1 | |
| hat | 2 (+none) | 2 | 1 | `none` = pas de chapeau |
| accessory | 2 (+none) | 2 | 1 | `none` = rien |

**Fichiers** :
- `svg/{slot}-{id}.svg` — un fragment par asset (ex. `svg/hat-bonnet-rouge.svg`)
- `manifest.json` — `{"slots":[{"id":"hat","z":5,"label":"Chapeau","assets":[{"id":"bonnet-rouge","label":"Bonnet rouge","rarity":"commun"},…]}], "names":{"prefixes":[…],"cores":[…],"suffixes":[…]}}`
  Ordre de z (empilement) : background 0, body 1, ears 2, eyes 3, hat 4, accessory 5.
  `names` : ≥10 préfixes, ≥10 cœurs, ≥8 suffixes (nom = préfixe+cœur, suffixe ~50 %).
- `preview.html` — page statique **sans dépendance** qui empile les fragments
  (fetch des fichiers svg) : grille de tous les assets + un tirage aléatoire
  re-générable, pour contrôler l'alignement visuel.
- `README.md` — comment prévisualiser, comment ajouter un asset.

**Règle de génération (moteur, tâche E)** : rareté tirée d'abord (60/30/9/1) ou
forcée ; chaque slot tire parmi les assets de rareté ≤ palier ; au moins un slot
tire exactement le palier (sinon on re-tire) ; RNG déterministe semé par `seed`.
`legendaire` force `body = doré`.

## Contrat — compléments REST (au-delà du cahier §5)

| Méthode | Route | Corps → Réponse |
|---|---|---|
| GET | `/api/admin/lutins/parts` | → manifest complet (slots + labels + raretés) |
| POST | `/api/admin/lutins/preview` | `{seed?, rarity?, overrides?:{slot:asset_id}}` → `{seed, rarity, name, manifest, svg}` |
| POST | `/api/admin/lutins` | idem (sans svg) → lutin créé |
| GET | `/api/auctions` | ventes `scheduled` + `open` (avec lutin, prix courant, `ends_in_s`) |
| GET | `/api/me` | `{user, points_total, points_available, reserved:[{auction_id,amount}]}` |

Ports dev : api `3000`, vite `5173` (proxy `/api` et `/ws` dans vite.config).
Auth WS phase 2 : `?token=` exigé dès le début (simple à faire tout de suite).

## Découpage en vagues (chaque tâche = un agent)

| Vague | Tâche | Scope (répertoires) | Dépend de |
|---|---|---|---|
| 1 | **A · assets** | `server/assets/lutins/` | — |
| 1 | **B · server-core** | `server/` (hors `assets/`), `docker-compose.yml`, `.gitignore` | — |
| 1 | **C · web-core** | `web/` | — |
| 2 | **D · server-auth** | `server/src/{auth,me}`, Cargo.toml | B |
| 2 | **F · web-shell** | `web/src/{pages,components}` (login/register/layout) | C |
| 3 | **E · server-lutins** | `server/src/lutins/`, routes | A, B, D (garde admin) |
| 3 | **G · server-auctions-ws** | `server/src/{auctions,ws}`, routes | B, D |
| 3 | **H · web-studio** | `web/src/pages/Admin*` (concepteur de lutins) | C, F, contract parts/preview |
| 3 | **I · web-enchères** | `web/src/pages/{Auctions,Auction}` (salle live) | C, F, socket |
| 4 | **J · intégration** | compose front, README, seed, e2e « 2 navigateurs < 1 s » | tout |

## Definition of done — fin de vague 3 (= critère phase 2 de la fiche)

1. `docker compose up` démarre db + api (+ front dès J).
2. Deux navigateurs : une mise dans l'un apparaît dans l'autre en < 1 s.
3. Inscription facile (pseudo + mot de passe, auto-login, 1000 points).
4. L'admin crée un lutin dans le **studio** (rareté, choix par slot, aperçu live)
   et le met en vente ; un joueur mise ; chrono + anti-sniping visibles.
5. Messages observés dans l'onglet Réseau conformes au contrat §5.
