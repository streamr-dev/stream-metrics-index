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

CMD ./run-all.sh initialize-database
