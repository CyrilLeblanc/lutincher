# Lutincher

Maison de ventes aux enchères **temps réel** de lutins uniques générés
procéduralement. Projet fil rouge « Web Temps Réel » : chaque inscription
offre **1000 points** fictifs, la classe s'affronte à coups de surenchères en
direct, et la fin de partie désigne la collection la plus prestigieuse.

## Le sujet en bref

- **Génération procédurale SVG** : un `seed` → assemblage de calques (fond,
  corps, oreilles, yeux, chapeau, accessoire). La rareté (commun → légendaire
  doré) est tirée en premier et contraint le choix des calques.
- **Enchères ascendantes** : prix de départ, palier minimal, chrono serveur,
  **anti-sniping** (mise dans les 10 dernières secondes → +10 s), **réservation
  implicite** des points (un solde ne peut jamais devenir négatif).
- **Victoire = valeur de collection** (somme des valeurs de rareté des lutins
  remportés), départage par points restants puis nombre de lutins.

Références complètes : [`CAHIER_DES_CHARGES.md`](CAHIER_DES_CHARGES.md)
(règles, contrat de messages), [`docs/PLAN.md`](docs/PLAN.md) (architecture,
schéma DB, conventions) et [`docs/protocole-websocket.md`](docs/protocole-websocket.md)
(messages WS réels, séquencés par `seq`).

## Utilisateurs

| | Joueur (la classe) | Admin (le groupe) |
|---|---|---|
| Accès | Inscription libre, 1000 points | Compte créé au démarrage (`admin` / `lutincher`) |
| Peut | miser, suivre les ventes, sa collection, le classement | tout + générer des lutins, programmer des ventes, clôturer la partie |

> ⚠️ Le compte admin par défaut (`admin` / `lutincher`) est un mot de passe de
> démonstration : à changer (`ADMIN_PASSWORD` dans `docker-compose.yml`) avant
> toute exposition.

## Scénario principal en 5 étapes

1. Un visiteur crée un compte → il reçoit **1000 points**.
2. Un admin génère des lutins et programme une vente (prix de départ, durée).
3. La vente démarre : chrono visible par tous, présence des connectés, mises en direct.
4. Surenchères et prolongations anti-sniping jusqu'à la clôture ; le gagnant est
   débité, les autres récupèrent leurs points réservés.
5. Le classement live évolue à chaque vente ; à la clôture de la partie, podium
   et vainqueur sont affichés.

## Architecture

```
Navigateur — React + TypeScript (Vite, servie par nginx)
   │  REST /api (snapshots)  ·  WebSocket /ws (différentiel, seq global)
   ▼
api (Rust, axum, 1 instance) ── journal d'événements append-only
   ▼
PostgreSQL (sqlx) — utilisateurs, lutins, ventes, mises, événements
```

Le temps réel passe par un **hub WebSocket** unique : chaque événement est
numéroté (`seq`) et journalisé en base avant diffusion — c'est ce qui permettra
le rattrapage à la reconnexion (phase 3) et le fan-out multi-instances (phase 4).

## Lancement (une commande)

```bash
docker compose up --build
```

Puis ouvrir **http://localhost:8080** (front servi par nginx, qui proxifie
`/api` et `/ws` vers l'api). Les trois services `db`, `api` et `front`
démarrent, les migrations s'appliquent et le compte admin est créé
automatiquement. Healthcheck : `curl http://localhost:8080/api/healthz`.

## Développement local

```bash
# Base + api (Rust)
docker compose up -d db
cd server && DATABASE_URL=postgres://lutincher:lutincher@localhost:5432/lutincher \
  JWT_SECRET=dev-secret cargo run

# Front (Vite en mode dev, proxy /api et /ws vers :3000)
cd web && pnpm install && pnpm run dev   # http://localhost:5173
```

Vérifications : `cd server && cargo clippy --all-targets -- -D warnings && cargo test` ;
`cd web && pnpm run build && pnpm run lint`.

## Démo rapide (5 actions)

1. **Créer un compte** sur http://localhost:8080/inscription → 1000 points.
2. Se connecter en **admin**, onglet *Concepteur de lutins* : choisir une
   rareté, ajuster les calques, **enregistrer le lutin**.
3. Onglet *Ventes* : sélectionner le lutin, **programmer la vente** (démarrage
   immédiat).
4. Dans deux navigateurs (un par joueur), ouvrir la salle de vente : **miser
   alternativement** — chaque mise apparaît chez l'autre en moins d'une
   seconde, le surenchéri reçoit « tu as été surenchéri », une mise dans les
   10 dernières secondes prolonge le chrono.
5. À la clôture de la vente, consulter **/classement** (live) puis **/collection**
   (lutin remporté, valeur totale).

## Tests

```bash
cd server && cargo test   # règles d'enchères + moteur de génération (19 tests)
```
