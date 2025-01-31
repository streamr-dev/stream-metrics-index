STREAM_ID=$1
RUN_ID=$2
LOGFILE=~/.pm2/logs/stream-metrics-index-crawler-out.log
grep $RUN_ID $LOGFILE | grep 'Queried' | grep $STREAM_ID | jq -s 'map(.info.applicationVersion) | group_by(.) | map({(.[0]): length}) | add'
