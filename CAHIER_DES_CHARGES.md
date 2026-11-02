# Cahier des charges — Lutincher

| | |
|---|---|
| **Projet** | Fil rouge « Web Temps Réel » — maison de ventes aux enchères de lutins |
| **Groupe** | À compléter (noms, filière) |
| **Stack imposée** | Back : Rust · Front : React + TypeScript |
| **Version** | 0.1 — 2026-11-02 |

---

## 1. Contexte et objectif

Concevoir, réaliser, sécuriser, faire passer à l'échelle et mesurer une application
temps réel (cadre : fiche projet fil rouge, J1 → J4), puis la défendre en soutenance.

**Pitch** : *Lutincher* est une maison de vente aux enchères en ligne où s'échangent
des lutins uniques générés procéduralement. Chaque inscription donne 1000 points
fictifs ; la classe s'affronte à coups de surenchères en direct, et la fin de partie
désigne la collection la plus prestigieuse.

**Principe directeur** : un code **minimaliste et propre**. Petit périmètre bien
fini, aucune fonctionnalité décorative, chaque fichier reste court et testable.

### Scénario principal en 5 étapes

1. Un visiteur crée un compte → il reçoit **1000 points**.
2. Un admin génère des lutins et programme une vente (prix de départ, durée).
3. La vente démarre : chrono visible par tous, présence des connectés, mises en direct.
4. Surenchères et prolongations anti-sniping jusqu'à la clôture ; le gagnant est
   débité, les autres récupèrent leurs points réservés.
5. Le classement live évolue à chaque vente ; à la clôture de la partie, podium et
   vainqueur sont affichés.

---

## 2. Utilisateurs et rôles

| | Joueur (la classe) | Admin (le groupe) |
|---|---|---|
| Accès | Inscription libre, 1000 points offerts | Compte créé par seed, rôle `admin` |
| Peut | miser, suivre les ventes, voir sa collection, le classement, les lutins | tout ce qu'un joueur + générer des lutins, programmer/ouvrir des ventes, clôturer la partie |
| Ne peut pas | créer de ventes, modifier ses points | — |

---

## 3. Règles du jeu

### 3.1 Points

- Monnaie unique : le **point**, entier, sans décimale. Inscription = **1000**.
- Aucun moyen de gagner des points en dehors des ventes (pas de revente, pas de bonus).
- Un flux de données **entièrement simulé** : aucune API payante, aucun paiement réel.

### 3.2 Lutins

- **Génération procédurale SVG** par assemblage de calques : peau, corps, chapeau,
  oreilles, yeux, accessoire, fond. Un `seed` → RNG déterministe → choix des assets.
- La **rareté est tirée en premier**, puis les assets sont contraints par palier
  (un légendaire obtient la palette dorée et des accessoires exclusifs).
- Générateur de **noms** par syllabes (« Bergamote des Neiges », « Pirouette Caramel »).

| Rareté | Fréquence visée | Valeur en collection |
|---|---|---|
| Commun | ~60 % | 10 |
| Rare | ~30 % | 50 |
| Épique | ~9 % | 200 |
| Légendaire (doré) | ~1 % | 800 |

- L'admin peut **forcer la rareté** d'un tirage (ex. « 1 épique garanti ») pour
  scénariser une vente spectaculaire en démonstration.
- Les assets SVG sont dessinés à la main et versionnés dans le dépôt.

### 3.3 Ventes aux enchères

- Enchère **ascendante**. Paramètres par vente : prix de départ (défaut 50),
  palier minimal (défaut 10), durée initiale (défaut 90 s).
- Une mise doit être **≥ mise courante + palier** (ou = prix de départ si première).
- **Anti-sniping** : toute mise dans les 10 dernières secondes **prolonge l'échéance
  de 10 s** (sans plafond — assumé et documenté).
- **Réservation (escrow)** : miser réserve le montant ; être surenchéri libère
  immédiatement les fonds. À la clôture, la réservation du gagnant devient débit.
  Garantit qu'un solde ne peut jamais devenir négatif.
- **Horloge du serveur = source de vérité** : le serveur diffuse `ends_in_s` ;
  les clients affichent avec correction de décalage. Jamais de chrono local maître.
- Clôture : le gagnant paie, il remporte le lutin (définitif, pas de revente),
  un événement `auction_ended` est diffusé à tous.
- 1 à 3 ventes simultanées maximum, indépendantes.

### 3.4 Fin de partie et classement

- **Clôture** déclenchée par un admin : plus aucune nouvelle vente, les ventes en
  cours se terminent normalement, puis podium figé + bannière du vainqueur.
- **Critère de victoire : valeur de collection** = somme des valeurs de rareté des
  lutins remportés (les points restants ne comptent pas — sinon ne pas enchérir
  serait la stratégie optimale).
- Égalité départagée par : points restants, puis nombre de lutins, puis ex æquo.
- Le classement général (valeur de collection) est visible et **live** pendant
  toute la partie.

---

## 4. Fonctionnalités

### 4.1 Joueur

| # | Fonctionnalité | Priorité |
|---|---|---|
| J1 | Inscription / connexion (JWT), 1000 points à l'inscription | MVP |
| J2 | Liste des ventes en cours et à venir, avec chrono live | MVP |
| J3 | Page de vente : lutin, historique des mises en direct, bouton miser (montant suggéré = courant + palier) | MVP |
| J4 | Fiche lutin : image SVG, nom, rareté, valeur | MVP |
| J5 | Ma collection (lutins remportés) | MVP |
| J6 | Classement live | MVP |
| J7 | Notifications : « tu as été surenchéri », « vente sur le point de se clôturer » | Phase 3 |
| J8 | Présence : nombre et identité des connectés | Phase 3 |

### 4.2 Admin

| # | Fonctionnalité | Priorité |
|---|---|---|
| A1 | Générer N lutins (rarité auto ou forcée) | MVP |
| A2 | Programmer une vente : lutin, prix de départ, palier, durée, heure de début | MVP |
| A3 | Ouvrir / annuler une vente programmée | MVP |
| A4 | Clôturer la partie → podium | MVP |
| A5 | Vue d'ensemble : économie en circulation, ventes passées | Option |

### 4.3 Transverse

| # | Fonctionnalité | Priorité |
|---|---|---|
| T1 | Reconnexion automatique (backoff exponentiel + gigue) avec rattrapage des événements manqués | Phase 3 |
| T2 | Gestion des états d'erreur : hors ligne, serveur indisponible, jeton expiré | Phase 3 |

**Hors périmètre (assumé)** : revente entre joueurs, enchère automatique (sniper bot),
messagerie, personnalisation des lutins, comptes multiples anti-triche (documenté
comme limite).

---

## 5. Contrat de messages (v0)

Un seul canal **WebSocket**, JSON typé, champ discriminant `type`.
Chaque message serveur porte un **numéro de séquence global `seq`** (journal
append-only en base) → rattrapage à la reconnexion et filtrage des doublons.

### Client → Serveur

```json
{"type":"bid","auction_id":7,"amount":120}
{"type":"sync","last_seq":41}
{"type":"ping"}
```

### Serveur → Client

```json
{"type":"auction_started","auction":{"id":7,"lutin":{...},"start_price":50,"increment":10,"ends_in_s":90},"seq":42}
{"type":"bid","auction_id":7,"amount":120,"bidder":"alice","ends_in_s":14,"seq":43}
{"type":"auction_ended","auction_id":7,"winner":"alice","amount":150,"seq":44}
{"type":"outbid","auction_id":7,"by":"bob","amount":130,"seq":45}
{"type":"presence","online":[{"user":"alice"},{"user":"bob"}],"seq":46}
{"type":"leaderboard","rows":[{"user":"alice","value":260,"lutins":3}],"seq":47}
{"type":"game_closed","podium":[...],"seq":48}
{"type":"sync","events":[...],"seq":49}
{"type":"error","code":"bid_too_low","detail":"mise < courant + palier","seq":50}
```

Codes d'erreur : `unauthorized`, `forbidden`, `bid_too_low`, `insufficient_funds`,
`auction_not_open`, `malformed_message`, `message_too_large`, `rate_limited`.

### Snapshots par REST (état initial)

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/api/auth/register` · `/api/auth/login` | JWT |
| GET | `/api/me` | profil, solde, réservations |
| GET | `/api/auctions` · `/api/auctions/:id` | ventes en cours + à venir |
| GET | `/api/lutins/:id.svg` | image SVG (cache longue) |
| GET | `/api/leaderboard` | classement |
| POST | `/api/admin/lutins` | générer des lutins |
| POST | `/api/admin/auctions` | programmer une vente |
| POST | `/api/admin/game/close` | clôturer la partie |

WebSocket : `/ws?token=<jwt>` — les snapshots initiaux sont servis par REST au
chargement de page, le WebSocket ne diffuse que du **différentiel**.

---

## 6. Architecture technique

```
Navigateur — React + TypeScript (Vite)
   │  REST (snapshots)  ·  WebSocket JSON (différentiel, seq)
   ▼
Répartiteur (phase 4 : Traefik ou Nginx)
   ▼
api (Rust, axum) ×1 — puis ×2 (phase 4)
   │         │
   │         └── Redis pub/sub (phase 4 : fan-out inter-instances)
   ▼
PostgreSQL (sqlx) — utilisateurs, lutins, ventes, mises, journal d'événements
```

### Choix retenus (tableau de décision — version initiale, à finaliser en phase 1)

| Décision | Retenu | Alternative | Justification |
|---|---|---|---|
| Transport temps réel | WebSocket nu (axum) | SSE ; Socket.IO (socketioxide) | bidirectionnel (mises + diffusion sur un seul canal), un seul contrat ; reconnexion/heartbeat **implémentés par nous** car critère évalué (phase 3) ; frames JSON lisibles telles quelles dans l'onglet Réseau (critère phase 2) ; pas de dépendance protocole tiers côté Rust ; le resync par `seq` reste applicatif de toute façon |
| Framework back | axum | actix-web | écosystème tokio/tower : middlewares (CORS, rate-limit, timeout) prêts — utile phase 3 |
| Persistance | PostgreSQL | SQLite | état partagé entre 2 instances dès la phase 4, sans rework ; sqlx typé compile-time |
| Broker (phase 4) | Redis pub/sub | NATS, Kafka | périmètre minimal, déjà suffisant pour du fan-out best-effort + resync par `seq` |
| Sérialisation | JSON | MessagePack | lisible dans l'onglet Réseau (critère fiche) ; MessagePack = optimisation mesurée candidate phase 5 |
| Génération d'images | SVG assemblé côté serveur | PNG, API externe | vectoriel, léger, déterministe, zéro dépendance/payant |

### Sécurité (phase 3)

- **Auth sur la connexion persistante** : JWT signé (HS256) transmis à la poignée
  WS ; connexion sans jeton valide → refusée.
- **Whitelist d'origine** : la poignée WS vérifie l'en-tête `Origin` contre la
  liste autorisée (dev : `localhost:5173` ; prod : domaine du front).
- **Validation** : tout message entrant décodé via serde avec taille maximale
  (512 octets) ; message malformé ou trop gros rejeté (erreur typée), le serveur
  continue de tourner.
- **Limitation de débit** : par utilisateur (≤ 5 mises / 10 s par vente) et
  globale (tower).
- Mots de passe : argon2. Secret JWT et URL de base : variables d'environnement.

### Reconnexion (phase 3)

- Backoff exponentiel : 1 s → 2 s → 4 s → … plafond 30 s, gigue ±20 %.
- Au retour : `{"type":"sync","last_seq":n}` → le serveur rejoue les événements
  manquants depuis le journal ; doublons filtrés par `seq` côté client.
- **Garantie de livraison annoncée** : *au plus une fois* vers les connectés,
  *au moins une fois* après reconnexion (journal + `seq`) — doublons possibles,
  filtrés par le client ; désordre impossible (séquence globale monotone).

### Présence (phase 3)

- Heartbeat serveur/client (ping toutes les 10 s) ; un onglet fermé disparaît de
  la liste dans un délai annoncé ≤ 30 s.

### Docker compose (exigence socle : une seule commande)

| Service | Image | Phase |
|---|---|---|
| `front` | build Vite servi par Nginx | 2 |
| `api` (×1 puis ×2) | build Rust | 2 / 4 |
| `db` | PostgreSQL | 2 |
| `redis` | Redis | 4 |
| `proxy` | Traefik ou Nginx | 4 |
| `prometheus`, `grafana` | officielles | 5 |

Un script de seed (admin, ~40 lutins, ventes prêtes) s'exécute au démarrage :
`docker compose up` suffit pour une démo sur un poste propre.

---

## 7. Mapping sur les 6 phases du fil rouge

| Phase | Livrables Lutincher |
|---|---|
| **1** J1 | README (sujet, scénario 5 étapes), schéma d'architecture étiqueté par flux, tableau de décision finalisé, contrat de messages (§5), dépôt Git |
| **2** J1–J2 | Auth + ventes + mises sur WebSocket ; deux navigateurs voient une surenchère < 1 s ; `docker compose up` complet |
| **3** J2 | JWT sur WS, whitelist origine, validation serde + taille max, rate-limit, reconnexion backoff + resync `seq`, présence |
| **4** J2–J3 | 2 instances + Redis pub/sub + répartiteur ; arrêt d'une instance → bascule des clients ; garantie de livraison démontrée (doublons filtrés, ordre garanti) |
| **5** J3 | Scénario k6 (montée en charge de miseurs), métriques Prometheus (connexions, msgs/s, latence de diffusion p50/p95, erreurs), dashboard Grafana, une optimisation mesurée avant/après (candidates : compression permessage-deflate, batch du classement, MessagePack) |
| **6** J3–J4 | Dossier 8–12 p. (plan fiche §9), vidéo 3 min, ligne du tableau comparatif, USAGE-IA.md |

### Protocole de mesure (phase 5, écrit avant de mesurer)

- Machine annoncée, durée (ex. 3 min par palier), montée par paliers
  (10 → 50 → 100 → 200 clients simulés), horodatage.
- Métriques : p50/p95 de latence mise→diffusion, débit msgs/s, connexions
  actives au moment de la dégradation.
- Même protocole rejoué à l'identique avant/après l'optimisation.

---

## 8. Décisions verrouillées

1. **Victoire = valeur de collection** (somme des raretés), départage points puis nombre de lutins.
2. **Chrono + anti-sniping** : +10 s si mise dans les 10 dernières secondes.
3. **PostgreSQL dès le début** (sqlx) — pas de rework phase 4.
4. **Pas de revente** entre joueurs : hors périmètre, cité comme piste dans le dossier.
