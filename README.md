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

The GraphQL endpoint is available e.g. at <http://localhost:4001/api>.


## Test

Start dependencies:

```
streamr-docker-dev start mysql dev-chain-fast deploy-network-subgraphs-fastchain
```

```
npm run test
```


## API

The API reference is available at the GraphQL endpoint (see "Docs" in the upper right corner).