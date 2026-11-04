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
nginx (répartiteur, round-robin, bascule passive)
   ▼                      ▼
api1 (Rust, axum)      api2 (Rust, axum)      ← mêmes sources, deux instances
   │  journal + publication (transaction)  ·  pub/sub « lutincher:events »
   ▼                      ▼
PostgreSQL (sqlx)      Redis — pub/sub (fan-out), présence, limite de mises
```

Chaque événement est **journalisé puis publié dans une même transaction**
(verrou consultatif Postgres) : `seq` et ordre de diffusion sont identiques
quelle que soit l'instance qui produit l'événement. Redis relaie ensuite chaque
événement à toutes les instances ; chacune le remet à ses propres connexions.
Si une instance perd Redis, elle coupe ses connexions : les clients se
reconnectent et rattrapent les événements manqués par `sync`.

Garantie annoncée : *au plus une fois* en direct, *au moins une fois* après
reconnexion (journal + `seq`) — les doublons sont filtrés côté client.

## Lancement (une commande)

```bash
docker compose up --build
```

Puis ouvrir **http://localhost:3000** (front servi par nginx, qui répartit
`/api` et `/ws` entre `api1` et `api2`). Les services `db`, `redis`, `api1`,
`api2` et `front` démarrent, les migrations s'appliquent et le compte admin est
créé automatiquement. Sur une base vide, un seed de démo crée aussi 40 lutins et
10 ventes, une par minute à partir du démarrage (`SEED_DEMO=false` pour
l'empêcher ; `loadtest/scripts/serie.sh` le fait). Healthcheck : `curl http://localhost:3000/api/healthz`
(le champ `instance` indique quelle instance a répondu).

## Développement local

```bash
# Base + broker, puis api (Rust)
docker compose up -d db redis
cd server && DATABASE_URL=postgres://lutincher:lutincher@localhost:5432/lutincher \
  REDIS_URL=redis://localhost:6379 JWT_SECRET=dev-secret cargo run

# Front (Vite en mode dev, proxy /api et /ws vers :3000)
cd web && pnpm install && pnpm run dev   # http://localhost:5173
```

Vérifications : `cd server && cargo clippy --all-targets -- -D warnings && cargo test` ;
`cd web && pnpm run build && pnpm run lint`.

## Démo rapide (5 actions)

1. **Créer un compte** sur http://localhost:3000/inscription → 1000 points.
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

### Démo multi-instances (phase 4)

```bash
docker compose logs -f api1 api2     # chaque connexion WS indique son instance
docker compose kill api1             # arrêt brutal d'une instance
```

Les clients connectés à `api1` se reconnectent seuls. Tant qu'`api1` est à
terre, nginx ne route que vers `api2` ; les clients se resynchronisent ensuite
depuis le journal, sans trou dans les mises.

Test scripté (Node 22 ou plus, stack lancée, une vente ouverte) :
`node loadtest/scripts/failover.mjs`, avec `COMPOSE=docker-compose` si la
commande `docker compose` n'existe pas. Résultat du 2026-11-04 : 7 contrôles
sur 7. nginx abandonne une instance morte après 1 s (`proxy_connect_timeout`)
et partage son état d'échec entre workers (`zone`) : sans ces deux réglages, la
reconnexion prenait plus de 30 s.

> **Attention** : nginx résout `api1` et `api2` au démarrage. Après une
> recréation d'un conteneur api (`docker compose up -d --build` la fait quand
> l'image change), relancer aussi le front : `docker compose restart front`.
> Sinon nginx peut garder l'ancienne adresse.

## Tests

```bash
cd server && cargo test   # règles d'enchères + moteur de génération (19 tests)
```
