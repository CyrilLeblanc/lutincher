# USAGE-IA -- Groupe G_ -- projet

Nom du groupe à compléter (cahier : « À compléter »). Journal tenu au fil de la
session ; les lignes des phases 1 à 3 sont résumées à partir de l'historique Git.

## Outils utilisés

- Claude Code (application bureau), agent de codage. Modèle : Haiku 5.5
  (`claude-haiku-5-5`) pour la session de reprise du 2026-11-04 ; modèles des
  sessions précédentes non notés.
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

## Réponses refusées

| Date / phase | Réponse proposée (résumé) | Motif du refus |
|---|---|---|
| — | Aucune réponse de l'IA refusée par le groupe à ce jour | À compléter en séance |

## Bilan (5 lignes au plus)

- Phase 4 : l'IA a écrit le code (bus Redis, journal, présence, limites de débit,
  nginx), vérifié sur deux instances locales (21 contrôles) ; deux défauts corrigés.
- Phase 5 : deux séries « avant » et deux « après » sous Docker. Gain médian de 10 à
  22 % ; écart en faveur de l'après aux paliers 100 et 200, à confirmer (deux séries).
- Non fait : test de bascule sous Docker, à relancer sous Node 22.
- Choix (verrou consultatif, protocole, lecture des gains) et démonstration à valider
  par le groupe ; ce document ne tient pas lieu de validation.
