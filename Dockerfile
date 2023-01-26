FROM node:18-bullseye as build
WORKDIR /usr/src/app
COPY . /usr/src/app
RUN npm ci
RUN npm run build
RUN chmod +x dist/bin/*.js
RUN rm -rf node_modules

FROM node:18-bullseye-slim
USER node
WORKDIR /usr/src/app
COPY --chown=node:node --from=build /usr/src/app/ .
RUN npm ci --omit=dev

EXPOSE 4001/tcp
ENV CONFIG_FILE config/development.json
HEALTHCHECK CMD ./dist/bin/health-check.js $CONFIG_FILE

CMD ./run-all.sh $CONFIG_FILE initialize-database
