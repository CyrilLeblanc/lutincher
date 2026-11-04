# Protocole de mesure (phase 5)

Rédigé **avant** la première mesure. Toute mesure suit ce protocole à
l'identique ; un écart est noté dans le tableau de résultats.

## 1. Machine et environnement

| Élément | Valeur |
|---|---|
| Machine | portable, AMD Ryzen 5 5600H (6 cœurs / 12 threads), 15,3 GiB RAM |
| OS / hôte Docker | Windows 11 Home 10.0.26200, Docker Desktop (WSL2) |
| Topologie | `docker compose up` : `db`, `redis`, `api1`, `api2`, `front` (nginx), `prometheus`, `grafana` |
| Générateur de charge | `grafana/k6:1.8.2` lancé dans le réseau compose (profil `loadtest`), donc passe par nginx comme un vrai navigateur |

**Limite assumée** : générateur, serveurs et base partagent la même machine.
Les chiffres absolus sont donc pessimistes ; seules les comparaisons avant/après
(même machine, même protocole) sont interprétées.

## 2. Remise à zéro avant chaque série

```bash
docker compose down -v           # base et Redis vidés : mêmes conditions de départ
docker compose up -d --build     # attendre db/redis healthy et api1/api2 prêtes
curl -s http://localhost:3000/api/healthz
```

## 3. Scénario de charge

Fichier versionné : [`loadtest/bidders.js`](../loadtest/bidders.js).

Un **palier** est un nombre de **spectateurs** : des WebSockets qui écoutent
seulement, comme un onglet de la salle (ping toutes les 10 s, comme le client).
Pendant toute la série, **5 enchérisseurs** s'y ajoutent.

- Setup : admin connecté, 12 ventes créées (prix de départ 50, **incrément 1**,
  durée 3600 s), 200 comptes spectateurs et 5 comptes enchérisseurs enregistrés.
- Spectateur : ouvre une WebSocket via nginx et la garde jusqu'à la fin de la
  série. Aucune mise.
- Enchérisseur : lit les ventes en REST une fois, puis mise toutes les 2,5 s sur
  une vente au hasard (≤ 4 mises / 10 s, sous la limite de 5). Socket gardée
  ouverte pendant toute la série.
- Montée en charge par paliers : **10 → 50 → 100 → 200 spectateurs**, rampe de
  20 s puis **palier tenu 3 min** à chaque niveau. Une série dure 13 min 20 s.
  Connexions actives attendues : spectateurs + 5, soit 15, 55, 105 et 205.
- Pourquoi l'incrément 1 et 12 ventes (choix fait après la série invalide, §7) :
  un enchérisseur n'a que 1000 points, donc une vente ne dépasse pas 1000. Avec
  un incrément de 10 et 3 ventes, le plafond est atteint en quelques minutes.
  Estimation avec le nouveau réglage : environ 2 mises/s pendant 800 s, réparties
  sur 12 ventes, soit un prix final moyen d'environ 180. Le nombre de refus
  `insufficient_funds` sera relevé après chaque série pour le confirmer.
- Lancement :

```bash
docker compose --profile loadtest run --rm k6
# résumé JSON : loadtest/results/last-run.json (copier avant la série suivante)
```

- Horodatage : `date -Is` noté au début et à la fin de chaque série ; les
  courbes Grafana (tableau de bord « Lutincher — temps réel ») se lisent sur la
  même fenêtre.
- Étiquetage par palier : chaque mesure k6 porte un tag `palier` de 0 à 3
  (10, 50, 100 et 200 spectateurs), selon l'instant d'envoi. La rampe de 20 s est taguée `ramp` et exclue. Le fichier
  `last-run.json` donne donc p50/p95 par palier sous les clés
  `bid_roundtrip_ms{palier:N}`, et `ws_connections` / `ws_errors` /
  `bids_accepted` par palier.

## 4. Métriques et sources

| Mesure | Source | Définition |
|---|---|---|
| p50 / p95 latence mise → diffusion | k6 `bid_roundtrip_ms` | temps entre l'envoi d'une mise acceptée et sa réception par son auteur |
| Latence côté serveur | Prometheus `lutincher_broadcast_latency_seconds` | temps entre la publication dans le journal et la remise aux connexions locales |
| Débit (messages/s) | Prometheus `lutincher_ws_frames_sent_total` (rate) | trames envoyées aux clients |
| Mises acceptées/s | k6 `bids_accepted` (rate) | mises validées |
| Connexions actives | Prometheus `lutincher_ws_connections` | somme sur les 2 instances (spectateurs + 5 enchérisseurs) |
| Erreurs et déconnexions | Prometheus `lutincher_errors_total`, `lutincher_ws_disconnects_total` ; k6 `bids_rejected`, `ws_errors` | |
| Taille des lots du journal (série « après » seulement) | Prometheus `lutincher_journal_batch_size` | événements par transaction du journal |

## 5. Critère de dégradation (fixé avant mesure)

Un palier est **dégradé** si, sur la fenêtre de 3 min :

- `p95 bid_roundtrip_ms` dépasse **1000 ms** (objectif de la phase 2 : « visible
  en moins d'une seconde »), **ou**
- le taux de `ws_errors` dépasse **1 %** des connexions.

Le **seuil de dégradation** est le nombre de spectateurs du palier précédent
le premier palier dégradé ; on rapporte aussi le nombre de connexions actives
au moment de la dégradation.

Dans `last-run.json`, le seuil `p(95)<1000` de chaque palier est une
**violation** quand sa valeur est `true` (k6 sort alors avec le code 99).

## 6. Répétition et comparaison avant / après

- Chaque configuration est mesurée **2 fois** (deux séries complètes, remise à
  zéro entre elles) ; on rapporte les deux valeurs et la médiane.
- Optimisation retenue (choisie avant mesure) : **écriture du journal par lots**.
  Aujourd'hui chaque événement ouvre sa propre transaction (verrou consultatif
  + INSERT + PUBLISH + COMMIT) ; le publisher regroupera les événements en
  attente en une seule transaction. Hypothèse : moins d'allers-retours Postgres
  par mise, donc un p95 plus bas à partir du palier 100. Le publisher prend les
  événements déjà en file, jusqu'à 64, sans attendre de remplir le lot : à faible
  charge, les lots doivent rester d'un seul événement, et la mesure le dira.
- Gain annoncé = (p95 avant − p95 après) / p95 avant, au même palier. Si le gain
  est nul ou négatif, on le dit tel quel.
- Résultat : voir la section 7. Écart en faveur de l'après aux paliers 100 et 200,
  à confirmer par d'autres séries ; paliers 10 et 50 non concluants.

## 7. Résultats

**Modifications faites après les quatre séries (2026-11-04 après-midi).** Aucune
série n'a été mesurée avec elles. Une nouvelle série devra refaire aussi les
séries « avant » (§6 du fichier de passation : mêmes conditions).

- nginx : `proxy_connect_timeout 1s` et `zone` partagée sur l'upstream. Elles ne
  jouent qu'en cas de panne d'une instance, mais la configuration n'est plus
  identique.
- Seed de démo au démarrage (40 lutins, 10 ventes). `serie.sh` le désactive
  (`SEED_DEMO=false`) : sans cela, des ventes de démo s'ouvriraient pendant la
  série.
- Limite de débit sur `sync` (10 par 10 s). Le scénario k6 n'envoie pas de
  `sync` : sans effet sur la charge mesurée.

*(à remplir après les mesures : une ligne par palier et par série)*

**Incidents de mesure (non retenus)**

- Série « avant » 1, première tentative (10:21) : arrêtée à 11 min 24 s, pendant
  l'exécution. Le journal k6 montrait une erreur à chaque fermeture de socket :
  un socket k6 n'a pas de `clearInterval` (k6 1.8.2). Non retenue.
- Corrections du script avant la relance : pas de minuterie annulée, un drapeau
  `closed` bloque l'envoi après fermeture. Une minuterie globale a été testée
  puis écartée : elle ne se déclenchait pas dans ce contexte.
- Essai court (5 enchérisseurs, 50 s) : 0 erreur, 117 mises envoyées.
- Série « avant » 1, relance complète (10:38 → 10:52, après `down -v`) : **non
  valide au-delà du palier 0**. Palier 0 (10 enchérisseurs) : 247 mises
  acceptées, p50 11 ms, p95 22 ms. Paliers 1 à 3 : aucune mise acceptée, donc
  aucune latence mesurée. Cause : chaque enchérisseur n'a que 1000 points, donc
  une vente ne peut pas dépasser 1000. Au pas de 10, une vente n'accepte que
  environ 95 mises. Les trois ventes ont atteint 1000 et 28 661 mises ont été
  refusées pour `insufficient_funds`. Ces refus passent aussi par le journal
  côté serveur. Résultat brut conservé dans `loadtest/results/avant-1-brut.json`.
  Le scénario doit être revu avant toute nouvelle série.
- Série « avant » 1, scénario B, première tentative (10:04 → 10:17 UTC) :
  **invalide**, conservée dans `loadtest/results/avant-1-invalide.json`. Deux
  défauts du scénario, pas du serveur :
  1. Le compte était choisi par `(__VU - 1) % 5`. Deux enchérisseurs partageaient
     le même compte (deux sockets chacun), et trois comptes seulement ont été
     utilisés. Deux sockets sur un même compte partagent une limite de 5 mises /
     10 s : d'où 546 refus `rate_limited`, soit environ 34 % des mises. Le serveur
     renvoie chaque erreur à toutes les tabs de l'utilisateur : k6 comptait donc
     les refus en double et perdait des mises acceptées (591 comptées pour 931
     côté serveur).
  2. À la fin du test, la minuterie de fermeture (au minimum 1 s) refermait chaque
     socket, qui était aussitôt rouverte par une nouvelle itération.
  Corrections : un scénario à un VU par enchérisseur (le nom du scénario donne le
  compte) ; spectateurs tirés au hasard (ils ne misent pas) ; mises acceptées
  appariées par clé `(vente, montant)` ; aucune socket une fois le test terminé.
  Vérification sur un test court (60 s, 5 enchérisseurs) : 7 sockets, une
  ouverture chacune ; 97 mises acceptées côté k6 et 97 côté serveur ; 18 refus
  `bid_too_low` des deux côtés ; 0 `rate_limited`.
- Choix du scénario (décidé après cette série) : **spectateurs**, avec 5
  enchérisseurs fixes, incrément 1 et 12 ventes (§3). Toutes les séries du
  tableau ci-dessous utilisent ce scénario ; la série invalide n'y figure pas.
- Série « avant » 1, mesures k6 valides (10 h 43 à 10 h 57 UTC) : les courbes
  Prometheus de cette série sont perdues. La remise à zéro de la série 2
  (`docker compose down -v`) a effacé Prometheus avant l'export ; une requête
  `query_range` sur la fenêtre renvoie un résultat vide. Côté k6 : 205 sessions,
  205 poignées réussies, 1 595 mises envoyées (1 373 acceptées, 222 refusées),
  0 erreur WebSocket. Correction : export avant chaque remise à zéro.
- Série « avant » 2 (10 h 57 à 11 h 11 UTC) : valide. Côté k6 : 206 sessions
  (205 attendues : une session de plus, sans erreur, non expliquée), 1 595 mises
  envoyées, 1 331 acceptées, 264 refusées (`bid_too_low`), 0 erreur WebSocket.
  Prometheus exporté avant toute remise à zéro : `loadtest/results/avant-2-analyse.md`.
- Analyse : la moyenne des connexions porte sur la fenêtre de 3 min décalée de
  10 s. Sans ce décalage, le dernier échantillon (0, fin du test) donnait 199 au
  palier 200 au lieu de 205. Les séries suivantes utilisent cette version.

| Série | Spectateurs | p50 (ms) | p95 (ms) | Mises acceptées/s | Connexions actives | Erreurs | Dégradé ? |
|---|---|---|---|---|---|---|---|
| avant, 1 | 10 | 20,5 | 52,1 | 1,72 | perdu | 0 | non |
| avant, 1 | 50 | 23,0 | 37,0 | 1,77 | perdu | 0 | non |
| avant, 1 | 100 | 24,0 | 39,0 | 1,69 | perdu | 0 | non |
| avant, 1 | 200 | 29,0 | 48,6 | 1,74 | perdu | 0 | non |
| avant, 2 | 10 | 20,0 | 33,0 | 1,67 | 15 | 0 | non |
| avant, 2 | 50 | 21,0 | 33,9 | 1,67 | 55 | 0 | non |
| avant, 2 | 100 | 23,0 | 39,0 | 1,68 | 105 | 0 | non |
| avant, 2 | 200 | 27,0 | 44,9 | 1,69 | 205 | 0 | non |
| après, 1 | 10 | 18,0 | 32,6 | 1,72 | 15 | 0 | non |
| après, 1 | 50 | 21,0 | 34,0 | 1,81 | 55 | 0 | non |
| après, 1 | 100 | 22,0 | 35,0 | 1,74 | 105 | 0 | non |
| après, 1 | 200 | 28,0 | 43,0 | 1,69 | 205 | 0 | non |
| après, 2 | 10 | 17,0 | 34,0 | 1,69 | 15 | 0 | non |
| après, 2 | 50 | 19,0 | 30,0 | 1,69 | 55 | 0 | non |
| après, 2 | 100 | 20,0 | 31,0 | 1,63 | 105 | 0 | non |
| après, 2 | 200 | 24,0 | 37,0 | 1,66 | 206 | 0 | non |

Seuil de dégradation : non atteint, ni avant (séries 1 et 2), ni après (séries 1 et 2). Aucune erreur WebSocket dans les quatre séries.

**Gain après optimisation** (p95 k6 ; gain = (médiane avant − médiane après) / médiane avant) :

| Spectateurs | p95 avant : série 1 / série 2 → médiane (ms) | p95 après : série 1 / série 2 → médiane (ms) | Gain |
|---|---|---|---|
| 10 | 52,1 / 33,0 → 42,55 | 32,6 / 34,0 → 33,3 | 21,7 % |
| 50 | 37,0 / 33,9 → 35,45 | 34,0 / 30,0 → 32,0 | 9,7 % |
| 100 | 39,0 / 39,0 → 39,0 | 35,0 / 31,0 → 33,0 | 15,4 % |
| 200 | 48,6 / 44,9 → 46,75 | 43,0 / 37,0 → 40,0 | 14,4 % |

Lecture, prudente (deux séries par configuration) :

- Aux paliers 100 et 200, chaque valeur après est sous chaque valeur avant : quatre paires sur quatre vont dans le même sens. C'est le palier où la section 6 prévoyait un effet.
- Avec deux séries par groupe, un ordre parfait à un palier arrive par hasard une fois sur six si l'optimisation n'y change rien : c'est un indice, pas une preuve.
- Aux paliers 10 et 50, rien n'est établi. Au palier 10, le gain médian vient surtout de avant 1 (52,1 ms) : avant 2 (33,0 ms) est au niveau de après 1 (32,6 ms). Au palier 50, après 1 (34,0 ms) dépasse avant 2 (33,9 ms).
- Latence serveur (`lutincher_broadcast_latency_seconds`, de la publication à la diffusion) : 1,0 ms aux quatre paliers, avant comme après. La mesure démarre à la publication, donc après l'attente du verrou du journal : un gain éventuel ne se lit que côté k6.

**Taille des lots du journal** (`lutincher_journal_batch_size`, une transaction par lot) :

- Série après 1 : 2 821 événements en 1 426 lots, soit 1,98 événement par lot. Lots de 1 : 496 ; de 2 : 644 ; de 3 à 4 : 284 ; de 5 à 8 : 1 ; de 9 à 16 : 1.
- Série après 2 : 2 815 événements en 1 521 lots, soit 1,85 événement par lot. Lots de 1 : 562 ; de 2 : 760 ; de 3 à 4 : 196 ; de 5 à 8 : 1 ; de 9 à 16 : 1 ; de 17 à 32 : 1.
- Le protocole prévoyait surtout des lots d'un seul événement à faible charge : ce n'est pas ce qui s'est produit. Une mise acceptée publie deux événements, `bid` puis `outbid` pour l'enchérisseur précédent, l'un après l'autre. Le publisher les prend probablement ensemble, d'où les lots de deux.

**Séries « après » : écarts à lire avec les séries avant**

- Série après 1 : valide. k6 sort en 0 (aucun seuil dépassé), 205 sessions, 1 595 mises envoyées, 1 373 acceptées, 222 refusées, 0 erreur WebSocket.
- Série après 2 : valide, avec trois écarts à inscrire. k6 : 1 595 mises envoyées, 1 336 acceptées, 259 refusées, 0 erreur WebSocket.
  1. **210 sessions k6 au lieu de 205.** Les journaux serveur montrent 212 ouvertures de sockets, dont 2 du compte `doudou` : 210 pour k6, toutes fermées à la fin du test (11 h 51 min 30 s UTC). Aucune fermeture en cours de test, aucun avertissement ni erreur dans les journaux. Cinq sockets s'ouvrent dans la même seconde, à la toute fin, et sont fermées avec les autres : elles sont hors des fenêtres de mesure. Cause exacte non vérifiée.
  2. **206 connexions au palier 200 au lieu de 205.** Un navigateur connecté a été compté dans la jauge `lutincher_ws_connections` (compte `doudou`, de 11 h 48 min 30 s à 11 h 53 min 27 s UTC). Le palier 200 porte donc un client de plus, qui n'est pas le scénario.
  3. **Trois requêtes de mise de plus côté serveur.** À l'export, le serveur comptait 1 338 mises acceptées et 260 refusées, contre 1 336 et 259 côté k6. Probablement des essais manuels pendant la série ou juste après sa fin (à confirmer). Elles entrent aussi dans les totaux de lots, pour quelques événements sur 2 815.
