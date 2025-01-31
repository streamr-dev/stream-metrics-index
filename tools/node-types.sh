LOGFILE=~/.pm2/logs/stream-metrics-index-crawler-out.log
echo 'Success:'
grep 'Queried' $LOGFILE | grep -o 'type":[0-9]' | tr -d '"' | sort | uniq -c
echo 'Failure:'
grep 'Query failed' $LOGFILE | grep -o 'type":[0-9]' | tr -d '"' | sort | uniq -c
