#!/usr/bin/env bash
# One measurement series (protocole-mesure §2 and §3): reset, start, wait for
# both instances, run k6, then analyse the Prometheus windows and export the
# journal batch sizes. Both exports run BEFORE the next reset: `down -v` erases
# Prometheus. No `set -e`: a k6 run that breaches a threshold (exit 99) must
# still be analysed.
# Usage, from the repo root (Git Bash or WSL): bash loadtest/scripts/serie.sh <name>
#   <name> = avant-1, apres-1, ...   Close the site and any browser tab first.
set -u
cd "$(dirname "$0")/../.." || exit 1
R=loadtest/results
PROM="http://localhost:9090/api/v1/query"
n="${1:?usage: serie.sh <name>}"
# No demo sale during a measurement: k6 creates its own 12 sales.
export SEED_DEMO=false

date -Is > "$R/$n-start.txt"
echo "[$n] reset $(date -Is)"
docker compose down -v
docker compose up -d --build

for i in $(seq 1 60); do
  c=$(for j in 1 2 3 4; do curl -s http://localhost:3000/api/healthz; echo; done | grep -o 'instance[^,}]*' | sort -u | wc -l)
  [ "$c" -ge 2 ] && break
  sleep 5
done
echo "[$n] instances answering: $c"
[ "$c" -ge 2 ] || { echo "[$n] instances not ready, series aborted"; exit 1; }

docker compose --profile loadtest run --rm k6
echo "[$n] k6 exit $?"
cp "$R/last-run.json" "$R/$n.json" && echo "[$n] copied $n.json"
date -Is > "$R/$n-end.txt"

sleep 20   # let Prometheus scrape the last samples of the hold
node loadtest/scripts/analyse.mjs "$R/$n.json" "$R/$n-start.txt" "$R/$n-end.txt" > "$R/$n-analyse.md"
echo "[$n] analysed: $R/$n-analyse.md"

# Batch sizes: only meaningful after the batching commit (802c253), since the
# metric does not exist before it. Counters restart with the containers.
for q in 'sum by (le) (lutincher_journal_batch_size_bucket)' 'sum(lutincher_journal_batch_size_sum)' 'sum(lutincher_journal_batch_size_count)'; do
  curl -s -G "$PROM" --data-urlencode "query=$q"; echo
done > "$R/$n-batch.json"
echo "[$n] batch sizes: $R/$n-batch.json"
