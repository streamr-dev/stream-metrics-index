NODE_ID=$1
LOGFILE=~/.pm2/logs/stream-metrics-index-crawler-out.log
grep -e 'Queried '$1 $LOGFILE | jq -sr 'map(.info.applicationVersion) | .[]' | sort | uniq
