#!/bin/bash
CONFIG_FILE=config/development.json

if [ "$1" == "initialize-database" ] 
then
    ./dist/bin/initialize-database.js $CONFIG_FILE
fi

# https://unix.stackexchange.com/questions/259413/from-bash-spawn-two-processes-and-exit-both-if-either-sibling-exits
pids=()
gotsigchld=false
trap '
  if ! "$gotsigchld"; then
    gotsigchld=true
    ((${#pids[@]})) && kill "${pids[@]}" 2> /dev/null
  fi
' CHLD
./dist/bin/api.js $CONFIG_FILE & pids+=("$!")
./dist/bin/crawler.js $CONFIG_FILE & pids+=("$!")
set -m
wait
set +m