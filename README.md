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

## Future improvements

Use node:18-bullseye-slim instead of node:18-bullseye, the image is half the size (compressed). Potential problem: "npm ci" (on arm64 at least) requires node-gyp requires python, so it must be installed first ("half the size" is only without python...).
