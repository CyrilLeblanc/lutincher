# Protocole WebSocket des enchères

Chaque event serveur porte le numéro de séquence global (`seq`) du journal append-only.

## 1. Vue d'ensemble

```mermaid
flowchart LR
    subgraph C["Client → Server"]
        CB["bid<br/>auction_id, amount"]
        CS["sync<br/>last_seq"]
        CP["ping"]
    end

    S{{"Serveur<br/>journal append-only<br/>(seq global)"}}

    subgraph R["Réponses directes"]
        SB["bid<br/>amount, bidder, ends_in_s"]
        SO["outbid<br/>by, amount"]
        SY["sync<br/>events[]"]
        SE["error<br/>code, detail"]
    end

    subgraph P["Poussés par le serveur"]
        AS["auction_started<br/>auction"]
        AE["auction_ended<br/>winner | null, amount | null"]
        PR["presence<br/>online[]"]
        LB["leaderboard<br/>rows[]"]
        GC["game_closed<br/>podium[]"]
    end

    CB --> S
    CS --> S
    CP -.-> S

    S -->|bid accepté, broadcast| SB
    S -->|au bidder dépassé| SO
    S -->|rejeu des events > last_seq| SY
    S -->|bid/sync invalide| SE

    S -.-> AS
    S -.-> AE
    S -.-> PR
    S -.-> LB
    S -.-> GC
```

## 2. Schéma des messages

```mermaid
erDiagram
    C_BID {
        Id auction_id
        number amount
    }
    C_SYNC {
        number last_seq
    }
    C_PING {
    }

    S_BID {
        Id auction_id
        number amount
        string bidder
        number ends_in_s
        number seq
    }
    S_OUTBID {
        Id auction_id
        string by
        number amount
        number seq
    }
    S_SYNC {
        ServerEvent[] events
        number seq
    }
    S_ERROR {
        ErrorCode code
        string detail
        number seq
    }
    S_AUCTION_STARTED {
        AuctionView auction
        number seq
    }
    S_AUCTION_ENDED {
        Id auction_id
        string_nullable winner
        number_nullable amount
        number seq
    }
    S_PRESENCE {
        PresenceEntry[] online
        number seq
    }
    S_LEADERBOARD {
        LeaderboardRow[] rows
        number seq
    }
    S_GAME_CLOSED {
        LeaderboardRow[] podium
        number seq
    }

    C_BID ||--o| S_BID : "accepte (broadcast)"
    C_BID ||--o| S_OUTBID : "ancien leader"
    C_BID ||--o| S_ERROR : "refuse"
    C_SYNC ||--o| S_SYNC : "rejeu"
    C_SYNC ||--o| S_ERROR : "invalide"
```

> `string_nullable` / `number_nullable` remplacent `string | null` / `number | null` (le `|` n'est pas accepté dans un type Mermaid).

## 3. Client → Serveur

| Type | Champs | Rôle |
|---|---|---|
| `bid` | `auction_id`, `amount` | Placer une enchère |
| `sync` | `last_seq` | Demander le rejeu des events manqués |
| `ping` | - | Heartbeat toutes les 10 s : renouvelle la présence du client (expiration à 25 s sans ping) |

## 4. Serveur → Client

| Type | Champs | Portée | Déclencheur |
|---|---|---|---|
| `auction_started` | `auction: AuctionView`, `seq` | Broadcast | Nouvelle enchère ouverte |
| `bid` | `auction_id`, `amount`, `bidder`, `ends_in_s`, `seq` | Broadcast | Enchère acceptée |
| `auction_ended` | `auction_id`, `winner: string \| null`, `amount: number \| null`, `seq` | Broadcast | Fin d'enchère (`null` si aucune mise) |
| `outbid` | `auction_id`, `by`, `amount`, `seq` | Individuel | Le bidder est dépassé |
| `presence` | `online: PresenceEntry[]`, `seq` | Broadcast | Changement de joueurs connectés |
| `leaderboard` | `rows: LeaderboardRow[]`, `seq` | Broadcast | Classement mis à jour |
| `game_closed` | `podium: LeaderboardRow[]`, `seq` | Broadcast | Fin de partie |
| `sync` | `events: ServerEvent[]`, `seq` | Individuel | Réponse à `sync` client |
| `error` | `code: ErrorCode`, `detail`, `seq` | Individuel | Requête invalide |

## 5. Correspondance requête → réponse

| Message client | Réponse serveur |
|---|---|
| `bid` | `bid` (broadcast) + `outbid` (à l'ancien leader), ou `error` (`rate_limited` au-delà de 5 mises par 10 s et par utilisateur) |
| `sync` | `sync`, ou `error` (`rate_limited` au-delà de 10 `sync` par 10 s et par utilisateur) |
| `ping` | Aucune (pas de `pong` typé) |

## 6. Problèmes identifiés

| Problème | Impact | Correction |
|---|---|---|
| Pas de `pong` | Impossible de mesurer la latence ou détecter une connexion morte côté client | Ajouter `{ type: 'pong' }` |
| `seq` sur `error` | Une erreur individuelle consomme un numéro du journal global | Retirer `seq` ou le rendre optionnel |
| `sync` récursif | `events` peut contenir un `sync` | Typer `events: Exclude<ServerEvent, { type: 'sync' }>[]` |
| `presence` avec `seq` | Pollue le journal si fréquent | Sortir du journal ou throttler |
| `bid` + `outbid` | L'ancien leader reçoit les deux | Vérifier que c'est voulu |
