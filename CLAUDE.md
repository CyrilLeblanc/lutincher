# CLAUDE.md — Lutincher

Projet fil rouge « Web Temps Réel » : maison de ventes aux enchères de lutins générés
procéduralement. **Références : `CAHIER_DES_CHARGES.md` (règles + contrat de messages)
et `docs/PLAN.md` (schéma DB, spec assets, découpage, conventions).**

## Stack

- **Back** : Rust + axum + sqlx + PostgreSQL (`server/`)
- **Front** : React + TypeScript + Vite, gestionnaire **pnpm** (`web/`)

## Commandes

```bash
# Back
cd server && cargo build && cargo clippy && cargo test

# Front (pnpm via corepack si absent : corepack enable --install-directory ~/.local/bin)
cd web && pnpm install && pnpm run build

# Tout lancer
docker compose up --build
```

## Règles projet

- **Minimalisme absolu** : plus petit code qui satisfait le critère de la fiche ;
  fichiers < ~300 lignes ; pas de dépendance front au-delà de react-router-dom.
- Commentaires/identificateurs en anglais ; textes UI en français dans
  `web/src/ui/strings.ts`.
- Erreurs typées (thiserror côté back, codes du contrat côté front).
- Une tâche/agent ne touche que les répertoires listés dans `docs/PLAN.md` ; les
  commits sont faits par l'intégrateur uniquement.
