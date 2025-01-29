LOGFILE=~/.pm2/logs/stream-metrics-index-crawler-out.log
(
grep 'Queried '$1 $LOGFILE | jq -s 'map({peerDescriptor: .info.peerDescriptor, runId, time: (.time/1000|todate), success: true}) | .[]'
grep 'Query failed '$1 $LOGFILE | jq -s 'map({peerDescriptor: .peerDescriptor, runId, time: (.time/1000|todate), success: false}) | .[]'
) | jq -s
