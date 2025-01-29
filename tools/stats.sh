#!/bin/bash

DEFAULT_LOGFILE=~/.pm2/logs/stream-metrics-index-crawler-out.log
LOGFILE="${1:-$DEFAULT_LOGFILE}"

printStats() {
    local RUN_ID=$1
    echo "Run $RUN_ID"

    local ITEMS=$(awk -v run_id="$RUN_ID" '$0 ~ run_id {print}' $LOGFILE)
    SUCCESS_ITEMS=$(jq -s 'map(select(.msg | contains("Queried ")))' <<< $ITEMS)
    FAILURE_ITEMS=$(jq -s 'map(select(.msg | contains("Query failed ")))' <<< $ITEMS)
    SUCCESS_DESCRIPTORS=$(jq 'map(.info.peerDescriptor)' <<< $SUCCESS_ITEMS)
    FAILURE_DESCRIPTORS=$(jq 'map(.peerDescriptor)' <<< $FAILURE_ITEMS)

    printCategoryStats 'All' "$SUCCESS_DESCRIPTORS" "$FAILURE_DESCRIPTORS" '.'
    printCategoryStats 'NodeJS-all' "$SUCCESS_DESCRIPTORS" "$FAILURE_DESCRIPTORS" '.type == 0'
    printCategoryStats 'NodeJS-WebSocket' "$SUCCESS_DESCRIPTORS" "$FAILURE_DESCRIPTORS" '(.type == 0) and (.websocket)'
    printCategoryStats 'NodeJS-AutoCertified' "$SUCCESS_DESCRIPTORS" "$FAILURE_DESCRIPTORS" '(.type == 0) and ((.websocket.host // "") | contains("streamr-nodes.xyz"))'
    printCategoryStats 'NodeJS-non-WebSocket' "$SUCCESS_DESCRIPTORS" "$FAILURE_DESCRIPTORS" '(.type == 0) and (.websocket | not)'
    printCategoryStats 'Browser' "$SUCCESS_DESCRIPTORS" "$FAILURE_DESCRIPTORS" ".type == 1"

    echo "Errors:"
    jq -r --monochrome-output 'map(.err.code) | group_by(.) | map({(.[0]): length}) | add' <<< $FAILURE_ITEMS

    echo "Versions:"
    jq -r --monochrome-output 'map(.info.applicationVersion) | group_by(.) | map({(.[0]): length}) | add' <<< $SUCCESS_ITEMS

    echo -e "\n\n"
}

printCategoryStats() {
    local CATEGORY=$1
    local SUCCESS_DESCRIPTORS=$2
    local FAILURE_DESCRIPTORS=$3
    local FILTER=$4

    local SUCCESS_COUNT=$(jq 'length' <<< $SUCCESS_DESCRIPTORS)
    local FAILURE_COUNT=$(jq 'length' <<< $FAILURE_DESCRIPTORS)
    local TOTAL_COUNT=$((SUCCESS_COUNT + FAILURE_COUNT))
    local FAILURE_PERCENTAGE=$((FAILURE_COUNT * 100 / TOTAL_COUNT))

    echo "$CATEGORY:"
    local CATEGORY_SUCCESS_COUNT=$(jq "map(select($FILTER)) | length" <<< $SUCCESS_DESCRIPTORS)
    local CATEGORY_FAILURE_COUNT=$(jq "map(select($FILTER)) | length" <<< $FAILURE_DESCRIPTORS)
    local CATEGORY_TOTAL_COUNT=$((CATEGORY_SUCCESS_COUNT + CATEGORY_FAILURE_COUNT))
    if [ "$CATEGORY_TOTAL_COUNT" -eq 0 ]; then
        local CATEGORY_FAILURE_PERCENTAGE=0
    else
        local CATEGORY_FAILURE_PERCENTAGE=$((CATEGORY_FAILURE_COUNT * 100 / CATEGORY_TOTAL_COUNT))
    fi
    echo "- total=$CATEGORY_TOTAL_COUNT success=$CATEGORY_SUCCESS_COUNT failure=$CATEGORY_FAILURE_COUNT ($CATEGORY_FAILURE_PERCENTAGE%)"
}

echo -e "\n\n"

grep 'Queried ' $LOGFILE | grep -o '"runId":"full-[0-9]*' | cut -c 10- | sort -u | while read -r RUN_ID; do
    printStats "$RUN_ID"
done
