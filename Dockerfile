FROM node:16-alpine AS builder

## Install build toolchain, install node deps and compile native add-ons
RUN apk update
RUN apk add --no-cache make g++ python3 libtool autoconf automake
RUN mkdir /app
WORKDIR /app
ADD package.json package-lock.json ./
RUN npm install --production

FROM node:16-alpine AS app

RUN mkdir /app
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
ADD index.js ./
ADD lib ./lib/

ENTRYPOINT ["node", "index.js"]
