FROM node:16-alpine as builder

## Install build toolchain, install node deps and compile native add-ons
RUN apk update
RUN apk add --no-cache python make g++
RUN mkdir /app
WORKDIR /app
add package.json package-lock.json .
RUN npm install --production

FROM node:16-alpine as app

COPY --from=builder node_modules .
RUN mkdir /app
WORKDIR /app
ADD index.js lib .

CMD ["node", "index.js"]
