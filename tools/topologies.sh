LOGFILE=~/.pm2/logs/stream-metrics-index-crawler-out.log
grep 'Topology:' $LOGFILE  | grep '"runId":"full' | jq -s '.[] | {msg, runId, time: (.time/1000) | todate}'
