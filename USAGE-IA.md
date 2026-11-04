# USAGE-IA -- Lutincher

Auteurs : XARDEL Edouard, LEBLANC Cyril et CLEMENT Jeremy. Journal tenu au fil de la
session ; les lignes des phases 1 à 3 sont résumées à partir de l'historique Git.

## Outils utilisés

- Claude Code (application bureau), agent de codage. Modèle : Haiku 5.5
  (`claude-haiku-5-5`) pour la session de reprise du 2026-11-04 ; modèles des
  sessions précédentes non notés. Session de reprise de l'après-midi du
  2026-11-04 (autre poste) : Claude Code (CLI), Opus 5.5 (`claude-opus-5-5`).
- Second poste (après-midi du 2026-11-04) : Windows 11 Pro, Node 26.12, moteur
  Docker 29.9 dans WSL (Debian) joint en TCP, `docker-compose` 5.7. Pas de
  linker MSVC : `cargo` est lancé dans un `docker build` (image `rust:1-slim`).
- Rust 1.99 (cargo) ; crates : axum 0.8, sqlx 0.8, redis 1.8.1, prometheus 0.14.
- Node 22.12 (nvm, Windows) pour le front, Node 20.19 (WSL) pour le client de
  test, pnpm 10.33.0, paquet `ws` 8 pour les tests.
- Vérification locale : Redis 8.0.2 et PostgreSQL 17 dans WSL (Debian), nginx
  (Debian).
- Docker Desktop (WSL2) : stack compose avec PostgreSQL 17, Redis 7, Prometheus
  3.5.5, Grafana 12.4.14 et k6 1.8.2 (image `grafana/k6`), lancée pour la mesure.

## Journal

| Date / phase | Besoin | Demande (résumé) | Retenu ? | Vérification effectuée | Correction apportée |
|---|---|---|---|---|---|
| 2026-11-02 / phases 1–3 (9e70871 → ecdd0d2) | Moteur, auth, enchères, WebSocket, studio, salle live | Coder les vagues du plan (`docs/PLAN.md`) via sous-agents | Oui | `cargo test` (19), clippy, tsc, lint | Dérives de contrat corrigées : enveloppes, `starts_at`, `username` (ecdd0d2) |
| 2026-11-03 / phase 4 | Ordre total entre instances | Publier dans la même transaction que l'INSERT du journal, sous `pg_advisory_xact_lock` | Oui | clippy, tests ; ordre `seq` strictement croissant sur deux instances | — |
| 2026-11-03 / phase 4 | Résynchronisation après perte du bus | Fermer les connexions locales si l'abonnement Redis tombe | Oui | `CLIENT KILL` : sockets fermées sur les deux instances, reconnexion et `sync` OK | Relecture : `serve()` gardait un clone de l'émetteur, donc la fermeture n'arrivait jamais ; registre unique et `Hub::send_to_conn` |
| 2026-11-03 / phase 4 | Présence | Présence par connexion avec TTL de 25 s et instantané atomique | Oui | Présence vue d'une instance à l'autre ; départ propre ; expiration après `kill -9` | — |
| 2026-11-03 / phase 4 | Limite de mises | 5 mises par 10 s, partagée entre instances | Oui | 6e mise refusée (`rate_limited`) alors que les mises passent par deux instances | — |
| 2026-11-03 / phase 4 | Répartition nginx | Round-robin avec bascule passive | Oui | Alternance api1/api2 ; api1 coupée → toutes les requêtes sur api2 ; upgrade WS via nginx OK | README : précision sur la bascule et caveat `docker compose restart front` (non vérifié sous Docker) |
| 2026-11-04 / phases 4–5 | Compteurs Prometheus | Séries présentes dès le démarrage | Oui | `/metrics` à 0 avant tout trafic ; 3 mises comptées une seule fois sur deux instances | Détecté au test : les statiques paresseux n'apparaissaient qu'au premier événement ; `register_all()` au démarrage |
| 2026-11-03/04 / phase 5 | Protocole de mesure, scénario k6, Grafana | Écrire le protocole et le scénario avant toute mesure | Oui | `node --check`, JSON du tableau de bord validé, `docker compose config -q` | — |
| 2026-11-04 / front | Build et lint | Corriger `pnpm run build` | Oui | Build et lint OK sous Node 22 | Binaire natif rolldown absent de node_modules : `pnpm install --frozen-lockfile` |
| 2026-11-04 / phase 5 | Démarrer la stack Docker pour la mesure | Lancer `docker desktop start` | Oui | `docker ps` : huit conteneurs actifs ; `/api/healthz` sur les deux instances | Le démarrage du moteur a exigé les droits administrateur |
| 2026-11-04 / phase 5 | Scénario de charge | Mesurer des spectateurs et des enchérisseurs | Oui, après corrections | Un seul enchérisseur : aucun `rate_limited` | Deux VU sur un même compte (`(__VU - 1) % 5`) : limite de débit partagée, 546 refus, compteurs faux ; un scénario par enchérisseur |
| 2026-11-04 / phase 5 | Fin du test de charge | Sockets rouvertes en boucle à la fin | Oui | Test court : 7 sockets, une ouverture chacune | Minuterie minimale de 1 s : 292 ouvertures ; temps restant calculé sans minimum |
| 2026-11-04 / phase 5 | Modification du script de charge | Changer les constantes avec `sed` | Non (corrigé) | Test court suivant : compteurs k6 et serveur égaux | Liste des paliers non modifiée : boucle vide pendant 10 min (6,3 millions d'itérations, aucune connexion). Mon premier message parlait à tort de 6,3 millions de connexions |
| 2026-11-04 / phase 5 | Rapprochement des mises | Comparer les mises de k6 et du serveur | Oui | Série 1 : 1595 envoyées = 1373 acceptées + 222 refusées | Appariement par clé `(vente, montant)` ; une erreur n'efface plus l'attente d'une autre socket |
| 2026-11-04 / phase 5 | Courbes Prometheus de la série 1 | Exporter les courbes avant la remise à zéro | Oui | Requête `query_range` vide sur la fenêtre de la série 1 | `docker compose down -v` a effacé les courbes ; export obligatoire avant chaque remise à zéro |
| 2026-11-04 / phase 5 | Lecture des paliers | Calculer les paliers pendant une série | Oui | Calcul relancé à la fin de la série | Des fenêtres encore en cours étaient lues comme des paliers complets |
| 2026-11-04 / phase 5 | Moyenne des connexions | Lire le nombre de connexions par palier | Oui | Valeurs relues dans Prometheus au palier 200 | Le dernier point de la fenêtre tombait à 0 (fin du test) : 199 au lieu de 205. Fenêtre décalée de 10 s, série avant 2 recalculée |
| 2026-11-04 / phase 5 | Contrôle avant commit | Vérifier le code avant commit et push (« si le code est bon ») | Oui | clippy avec avertissements en erreur, 19 tests OK | Premier lancement sans journaux (chemin de sortie vide), codes affichés à 0 : résultat non fiable. Relancé par script, après installation de clippy et rustfmt dans WSL |
| 2026-11-04 / phase 5 | Mise en forme (rustfmt) | Appliquer `cargo fmt` à tout le dépôt | Non | `cargo fmt --check` : écarts dans des fichiers des phases 1 à 4 | Non appliqué : reformater tout le dépôt ferait un diff hors périmètre |
| 2026-11-04 / phase 5 | Historique git | Committer et pousser | Oui | Branche `phase-5-mesure` poussée ; `main` locale alignée sur `origin/main` | Commit de base (état mesuré) séparé du lot grâce à un index construit à partir d'instantanés, empreintes vérifiées avant commit |
| 2026-11-04 / phase 5 | Séries après (journal par lots) | Mesurer le même scénario après l'optimisation, deux fois | Oui | k6 sort en 0 pour les deux séries ; 0 erreur WebSocket ; compteurs serveur relevés avant chaque remise à zéro | Gains médians de 10 à 22 % ; paliers 10 et 50 non concluants. Hypothèse « lots d'un événement à faible charge » fausse : 1,98 et 1,85 événement par lot (mise et outbid publiés ensemble) |
| 2026-11-04 / phase 5 | Écarts des séries après | Expliquer 206 connexions au palier 200 et 210 sessions k6 | Partiellement | Journal serveur : 212 ouvertures dont 2 du compte `doudou` ; 210 fermetures k6 toutes à 11 h 51 min 30 s ; 0 avertissement | Écarts inscrits en caveats dans le protocole ; cause des 5 sessions de fin de test non vérifiée |
| 2026-11-04 / phase 4 | Test de bascule sous Docker | Lancer `failover.mjs` : api1 coupée, clients basculés sur api2 | Non (à faire) | Échec avant la coupure : Node 20 n'a pas de WebSocket global ; 4 comptes de test créés | À relancer avec Node 22 : `node loadtest/scripts/failover.mjs` |
| 2026-11-04 / passation | Reprise par un autre membre du groupe | Rendre l'avancement repris sans cette conversation | Oui | `docs/passation.md` relu ; scripts vérifiés (`bash -n`, `node --check`) | La conversation et la mémoire ne se transmettent pas : passation par fichiers dans le dépôt. Le collègue consigne son propre usage de l'IA |
| 2026-11-04 / reprise | État du projet | Résumer la passation, croiser avec la fiche et le code | Oui | Recherche dans le code des quatre points ouverts (seed, limite `sync`, jeton expiré, J7) : absents | La passation donnait la PR à ouvrir : elle était déjà fusionnée (`272e8b5`) |
| 2026-11-04 / outillage | Compiler le serveur sur le second poste | `cargo build` sous Windows | Oui, autrement | `cargo build` échoue : pas de `link.exe` MSVC (et le `link` de Git Bash le masque) | Compilation, clippy (`-D warnings`) et 19 tests dans un `docker build` : un montage du dossier Windows arrive vide dans le moteur WSL |
| 2026-11-04 / phase 3 | Limite de débit sur `sync` (fiche, phase 3) | Réutiliser le script Lua de la limite de mises | Oui, après correction | Client réel : 12 `sync` rapides donnent 10 rejeux puis 2 `rate_limited` | Première valeur proposée : 3 par 10 s. Relevée à 10 : après une perte de Redis, tous les onglets d'un joueur se reconnectent et demandent leur rattrapage en même temps |
| 2026-11-04 / démo | Seed du cahier (« ~40 lutins, ventes prêtes ») | Créer 40 lutins et 10 ventes au démarrage, base vide seulement | Oui | Journaux : api1 crée 40 lutins et 10 ventes, api2 ne fait rien (verrou consultatif) ; une vente ouverte dès le démarrage | `SEED_DEMO=false` dans `serie.sh` : une vente de démo pendant une série changerait les conditions de mesure |
| 2026-11-04 / phase 3 | Jeton expiré côté client (T2) | Lire `exp` du JWT, fermer la session à l'échéance, bandeau | Oui | Build et lint OK ; bandeau vu dans le navigateur par un membre du groupe | — |
| 2026-11-04 / J7 | Alerte « vente sur le point de se clôturer » | Bandeau dans la salle pendant les 10 dernières secondes | Oui | Build et lint OK ; bandeau vu dans le navigateur par un membre du groupe | Calculé côté client depuis l'échéance donnée par le serveur ; aucun nouveau message dans le contrat |
| 2026-11-04 / phase 4 | Test de bascule sous Docker | Lancer `failover.mjs` (Node 26) | Oui, après trois corrections | 1er essai : 5/7 contrôles, puis le script s'arrête ; 2e essai : **7/7** | 1. Le script ouvrait `/api/ws` au lieu de `/ws`. 2. nginx attendait environ 14 s avant d'abandonner un conteneur tué (pas de refus TCP) : `proxy_connect_timeout 1s`. 3. Chaque worker nginx gardait son propre état d'échec : `zone` partagée. Contrôle : `/api/healthz` répond en 1,1 s pour la première requête après la coupure, puis tout de suite |
| 2026-11-04 / phase 6 | Dossier technique | Reprendre le dossier avec les mesures finales | Oui | Chiffres recopiés des fichiers `loadtest/results/*-analyse.md` et du protocole §7 | Le dossier précédent s'arrêtait à « avant 2 en cours » et à 7 pages ; nouvelle version dans `docs/dossier.md` |

## Réponses refusées

| Date / phase | Réponse proposée (résumé) | Motif du refus |
|---|---|---|
| — | Aucune réponse de l'IA refusée par le groupe à ce jour | À compléter en séance |

## Bilan (5 lignes au plus)

- Phase 4 : code écrit par l'IA (bus Redis, journal, présence, limites, nginx) ; bascule Docker 7/7 après deux corrections nginx.
- Phase 5 : deux séries avant, deux après ; p95 en baisse de 14 à 15 % aux paliers 100 et 200, rien d'établi à 10 et 50.
- Défauts trouvés par les tests, pas par la relecture : émetteur cloné, compteurs absents, comptes partagés, nginx lent à basculer.
- Ajouts de fin de projet (limite `sync`, seed, T2, J7) vérifiés par build, puis en direct : limite `sync` et seed par script, bandeaux T2 et J7 dans le navigateur.
- Choix (verrou consultatif, protocole, lecture des gains) à valider par le groupe ; ce document n'en tient pas lieu.
