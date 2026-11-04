t0 = 2026-11-04T10:57:36.000Z (palier windows: +20 s to +200 s, +220 s to +400 s, ...)
| Spectateurs | Connexions (moy.) | p50 k6 (ms) | p95 k6 (ms) | Acceptées/s k6 | Acceptées/s serveur | Trames/s | p95 serveur (ms) | Refus serveur | ws_errors | Dégradé ? |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | 15 | 20.0 | 33.0 | 1.67 | 1.66 | 27 | 0.9 | bid_too_low 60 | 0 | non |
| 50 | 55 | 21.0 | 33.9 | 1.67 | 1.65 | 95 | 1.0 | bid_too_low 62 | 0 | non |
| 100 | 105 | 23.0 | 39.0 | 1.68 | 1.66 | 182 | 0.9 | bid_too_low 61 | 0 | non |
| 200 | 205 | 27.0 | 44.9 | 1.69 | 1.66 | 344 | 1.0 | bid_too_low 51 | 0 | non |

k6 total : mises envoyées 1595, acceptées 1331, refusées 264, sessions 206, ws_errors 0
