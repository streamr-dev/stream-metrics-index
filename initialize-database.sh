#!/bin/bash
IMAGE=$(docker ps -qf 'name=mysql')
docker exec -i $IMAGE mysql -uroot -ppassword -e 'CREATE DATABASE stream_metrics_index'
docker exec -i $IMAGE mysql -uroot -ppassword stream_metrics_index < initialize-database.sql
