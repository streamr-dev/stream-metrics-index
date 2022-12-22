# stream-metrics-index


## Start

Create a config file (see `config/development.json`)

Initialize database (see `initialize-database.sql`)

```
npm run build
chmod +x dist/bin/*.js
```

Start both applications:
```
./dist/bin/api.js CONFIG-FILE
```

```
./dist/bin/crawler.js CONFIG-FILE
```

The GraphQL endpoint is available at http://localhost:PORT/api


## Test

Start dependencies:

```
streamr-docker-dev start mysql graph-deploy-streamregistry-subgraph trackers
```

```
npm run test
```