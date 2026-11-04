# Passation : phase 5 (mesure de performance)

Ce document permet de reprendre le travail sans la conversation d'origine. Il
décrit la branche `phase-5-mesure`, ce qui est fait, comment relancer les mesures
et ce qui reste. Tout est dans le dépôt, sauf les résultats bruts en JSON (voir
section 6).

## 1. État

- **Fait** : stack Docker à deux instances (api1, api2, nginx, Redis, PostgreSQL,
  Prometheus, Grafana, k6) ; optimisation « journal par lots » (commit `802c253`) ;
  quatre séries mesurées (avant 1 et 2, après 1 et 2) ; protocole, analyses,
  scripts et journal de l'usage de l'IA.
- **Fait ensuite (après-midi du 2026-11-04, sur `main`, non committé)** : PR
  `phase-5-mesure` fusionnée (#2) ; test de bascule sous Docker 7/7, après deux
  corrections nginx (`proxy_connect_timeout 1s`, `zone`) et la correction de
  l'URL dans `failover.mjs` ; limite sur `sync` (10 par 10 s) ; seed de démo
  (40 lutins, 10 ventes, `SEED_DEMO`) ; jeton expiré côté client (T2) ; bandeau
  « vente sur le point de se clôturer » (J7) ; dossier à jour dans
  `docs/dossier.md`.
- **Pas fait** : validation de la lecture des gains par le groupe.

## 2. Ordre de lecture

1. `CLAUDE.md` : règles du projet et commandes.
2. `CAHIER_DES_CHARGES.md` : règles et contrat de messages.
3. `docs/PLAN.md` : schéma, découpage, conventions.
4. `docs/protocole-mesure.md` : protocole (§1 à §6), puis résultats (§7).
5. `USAGE-IA.md` : journal de l'usage de l'IA et bilan.
6. `loadtest/results/*-analyse.md` : une sortie par série.
7. `README.md` : architecture multi-instances.
8. `docs/dossier.md` : dossier technique à jour (phase 6).

## 3. Résultats

Gain sur le p95 de la latence mise → diffusion (médiane des deux séries avant
comparée à la médiane des deux séries après) :

| Spectateurs | Gain | Lecture |
|---|---|---|
| 10 | 21,7 % | non concluant : avant 1 (52,1 ms) est loin d'avant 2 (33,0 ms) |
| 50 | 9,7 % | non concluant |
| 100 | 15,4 % | écart en faveur de l'après |
| 200 | 14,4 % | écart en faveur de l'après |

- Aucune erreur WebSocket et aucun palier dégradé (critère du protocole, §5).
- Latence serveur (`lutincher_broadcast_latency_seconds`) : 1,0 ms en p95 à tous
  les paliers. Elle part de la publication, donc n'inclut pas l'attente du verrou
  du journal.
- Lots du journal : 1,98 et 1,85 événement par lot. L'hypothèse « un événement
  par lot à faible charge » est fausse : une mise publie `bid` puis `outbid` à la
  suite.
- Avec deux séries par groupe, un ordre parfait à un palier arrive par hasard une
  fois sur six : c'est un indice, pas une preuve.

## 4. Commandes

Depuis la racine du dépôt, Docker Desktop lancé.

Démarrer la stack :

```bash
docker compose up -d --build
curl -s http://localhost:3000/api/healthz
```

Adresses locales : site http://localhost:3000, Grafana http://localhost:3001
(tableau « Lutincher — temps réel »), Prometheus http://localhost:9090. Les
identifiants de développement sont dans `docker-compose.yml`.

Une série complète (remise à zéro, test k6 de 13 min 20 s, analyse) prend environ
17 minutes. Ne pas utiliser le site, ni ouvrir de navigateur, pendant la série.

```bash
bash loadtest/scripts/serie.sh apres-3
```

Analyser une série déjà mesurée. Cela ne marche que si Prometheus contient encore
la fenêtre, donc avant la prochaine remise à zéro :

```bash
node loadtest/scripts/analyse.mjs loadtest/results/apres-1.json loadtest/results/apres-1-start.txt loadtest/results/apres-1-end.txt
```

Test de bascule (fait, 7/7) : Node 22 ou plus, stack lancée et une vente ouverte. Le
script coupe api1 pendant environ une minute et crée 4 comptes de test.

```bash
node loadtest/scripts/failover.mjs
COMPOSE=docker-compose node loadtest/scripts/failover.mjs   # sans « docker compose »
```

Le seed de démo assure une vente ouverte pendant les 10 premières minutes
après le démarrage sur une base vide.

Compilation et tests (règles de `CLAUDE.md`) :

```bash
cd server && cargo build && cargo clippy && cargo test
cd web && pnpm install && pnpm run build
```

## 5. Rejouer une série « avant »

Le code « avant » est le commit `dcacaf0`. Le commit suivant, `802c253`, ajoute le
journal par lots et est le seul à toucher le serveur depuis. Arrêter d'abord la
stack du dépôt principal (`docker compose down`, sans `-v`) : les deux stacks se
disputeraient les ports 3000 et 9090.

```bash
git worktree add ../lutincher-avant dcacaf0
cp -r loadtest/scripts ../lutincher-avant/loadtest/
cd ../lutincher-avant && bash loadtest/scripts/serie.sh avant-3
```

Recopier ensuite les fichiers de `loadtest/results/` du worktree vers le dépôt
principal. Les exports de lots ne servent pas pour une série avant : la métrique
`lutincher_journal_batch_size` n'existe pas dans ce code.

## 6. Pièges

- **Mêmes conditions.** Les chiffres ne se comparent qu'à conditions égales :
  même machine, même protocole. Si la machine change, refaire aussi les « avant ».
- **`docker compose down -v` efface PostgreSQL et Prometheus.** Exporter les
  courbes avant chaque remise à zéro ; `serie.sh` le fait en fin de série. Avant 1
  n'a pas d'analyse Prometheus : ses courbes ont été effacées par une remise à zéro
  trop tôt.
- **Pas de navigation pendant une série.** Une connexion de plus fausse le
  palier 200 : après 2 comptait 206 connexions au lieu de 205, à cause d'un
  navigateur connecté.
- **Les JSON ne sont pas dans git.** `loadtest/results/*.json` est ignoré, alors
  que `analyse.mjs` et les exports de lots en ont besoin. Les transmettre à part
  pour refaire les analyses.
- **Node 22 pour `failover.mjs`.** Avec Node 20, le script échoue à la première
  connexion (`WebSocket is not defined`), après avoir créé les comptes de test.
- **Docker Desktop sous Windows.** Le démarrage du moteur a demandé les droits
  administrateur.
- **Build front.** Si `pnpm run build` signale un binaire rolldown absent, lancer
  `pnpm install --frozen-lockfile`.
- **Format Rust.** `cargo fmt --check` échoue sur des fichiers des phases 1 à 4.
  Ce n'est pas corrigé exprès, pour ne pas mêler un reformatage du dépôt à ce lot.
  Ne pas lancer `cargo fmt` sur tout le dépôt sans l'avoir décidé.
- **nginx.** Le README signale un piège avec `docker compose restart front`,
  non vérifié sous Docker.
- **Périmètre.** `docs/PLAN.md` ne cite pas `loadtest/`, alors que `CLAUDE.md`
  limite chaque tâche aux répertoires de ce plan. À arbitrer avec l'intégrateur.

- **Poste sans MSVC.** `cargo build` sous Windows échoue sans `link.exe`. Passer
  par un `docker build` (image `rust:1-slim`) qui lance clippy et les tests.
  Avec un moteur Docker dans WSL joint en TCP, un montage de dossier Windows
  arrive vide, et `docker exec` ne renvoie aucune sortie.
- **pnpm absent.** `npx -y pnpm@10 run build` marche sans corepack.

## 7. Reste à faire

1. Faire valider par le groupe la lecture des gains (`docs/protocole-mesure.md`,
   §7, et `docs/dossier.md`, section 8).
2. Committer le lot de l'après-midi (code, nginx, scripts, documents).
3. Préparer la soutenance (J4) : 7 min, chaque membre parle, vidéo de secours prête.

Fait ou écarté : bandeaux T2 et J7 vus dans le navigateur ; pas de nouvelle série
de charge (les quatre séries suffisent) ; pas de relecture croisée.

## 8. Démarrage avec un autre Claude

Coller ce texte au début d'une nouvelle conversation, dans le dépôt :

```text
Tu reprends le projet Lutincher, branche main, dépôt local.
Lis dans cet ordre : CLAUDE.md, docs/passation.md, docs/dossier.md, docs/protocole-mesure.md, USAGE-IA.md.
Ne lance rien sur Docker et ne committe rien sans ma demande explicite : une série prend environ 17 minutes et efface la base.
Commence par résumer l'état et les points de « Reste à faire », puis propose un plan avant d'agir.
```
