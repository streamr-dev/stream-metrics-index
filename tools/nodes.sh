LOGFILE=~/.pm2/logs/stream-metrics-index-crawler-out.log
grep 'Queried ' $LOGFILE | jq -sr 'map("success " + .runId + " " + .info.peerDescriptor.nodeId) | .[]'
grep 'Query failed' $LOGFILE | jq -sr 'map("failure " + .runId + " " + .peerDescriptor.nodeId) | .[]'
