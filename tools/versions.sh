if [ $# -eq 0 ]; then
  echo "Error: No argument (runId) passed. Please provide an argument."
  exit 1
fi

LOGFILE=~/.pm2/logs/stream-metrics-index-crawler-out.log

grep $1 $LOGFILE | grep 'Queried' | jq .info.applicationVersion | sort | uniq -c | awk '{print $2, $1}'
