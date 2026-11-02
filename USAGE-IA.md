# USAGE-IA.md — Usage réel de l'IA dans Lutincher

Ce document décrit, **de façon factuelle**, comment l'IA (Claude Code) a été
utilisée dans ce projet. Il est destiné à l'équipe pédagogique et au groupe.

## Mode de travail : pilotage par orchestrateur

Le projet a été développé avec **Claude Code** utilisé comme *orchestrateur* :

- l'IA **planifie** le découpage (vagues de tâches décrites dans
  `docs/PLAN.md`, un périmètre de fichiers par tâche) ;
- chaque tâche est confiée à un **sous-agent** briefé (contexte, périmètre
  autorisé, critère de sortie) — les vagues A à I du plan (assets, cœur du
  serveur, cœur du front, auth, studio, enchères, WebSocket…) ;
- l'IA **relit, intègre et réconcilie** le travail des sous-agents (vague J :
  compose, Docker, corrections d'intégration, tests de bout en bout).

## Décisions prises par des humains

Les choix structurants ont été **verrouillés par le groupe avant la moindre
ligne de code** et transmis à l'IA comme contraintes (cahier des charges) :

- le sujet (maison d'enchères de lutins) et les **règles du jeu** ;
- la **stack imposée** (Rust côté back, React + TypeScript côté front) ;
- les choix techniques listés dans le tableau de décision du cahier
  (WebSocket nu plutôt que Socket.IO, PostgreSQL dès le début, SVG assemblé
  côté serveur…) ;
- le **critère de victoire** (valeur de collection) et les paramètres du jeu
  (1000 points à l'inscription, anti-sniping +10 s, paliers de rareté).

## Ce que l'IA a fait / n'a pas fait

**Fait par l'IA** : écrire le code (serveur, front, assets SVG, Docker,
documentation technique), les tests unitaires, la vérification continue
(`clippy`, `cargo test`, `tsc`, lint) et un scénario de bout en bout.

**Fait par des humains** : toutes les décisions ci-dessus, la **revue** du code
produit, les **commits** (l'intégrateur — humain assisté par l'IA — committe ;
aucun agent n'a commité), et la validation finale du groupe.

**Jamais fait par l'IA** : les choix pédagogiques, la répartition du travail
entre membres du groupe, la validation du rendu en séance, la rédaction des
parties « souvenirs d'équipe » attendues par la fiche projet.

## Tableau de suivi

| Tâche | Qui | Statut |
|---|---|---|
| Cahier des charges, règles du jeu, plan | Groupe (humain) | Verrouillé |
| Découpage en vagues + briefs de sous-agents | IA (orchestrateur) | Fait |
| Vague 1 — assets SVG, cœur serveur, cœur front | IA (sous-agents A/B/C) | Livré |
| Vague 2 — auth JWT, coquille front (login/register/layout) | IA (sous-agents D/F) | Livré |
| Vague 3 — moteur lutins, enchères + WebSocket, studio, salle live | IA (sous-agents E/G/H/I) | Livré |
| Vague 4 — intégration Docker (front nginx), README, réconciliations, e2e | IA (sous-agent J) | Livré |
| Revue de code et commits | Intégrateur humain + IA | En continu |
| Validation des choix et du rendu | Groupe (humain) | En séance |

## À compléter par le groupe

*(séances en présentiel — à remplir au fil du projet)*

- **Séance J1** : validation du cahier des charges et du contrat de messages ;
  relecture des vagues 1–2 ; décision sur le compte rendu d'usage de l'IA.
- **Séance J2** : relecture des vagues 3–4 (moteur d'enchères, WebSocket,
  intégration) ; qui a compris/adopté quelle partie ; difficultés rencontrées.
- **Phases 3–5** : répartition humaine des sujets (sécurité, reconnexion,
  montée en charge, métriques) — quelle part refaite à la main, quelle part
  assistée, et pourquoi.
- **Soutenance** : répartition des slides et de la démo ; bilan honnête de
  l'usage de l'IA (gain de temps, points appris, limites).
