# 🔭 DEVELOPMENT
FROM node:18-alpine as dev

WORKDIR /app

ENV NODE_ENV dev

COPY --chown=node:node . .

RUN npm install --frozen-lockfile

USER node

# 🔭 BUILD
FROM node:18-alpine as build

WORKDIR /app

ENV NODE_ENV production

COPY --chown=node:node --from=dev /app/node_modules ./node_modules
COPY --chown=node:node . .

RUN npm run build

RUN npm install --frozen-lockfile --production

USER node

# 🔭 PRODUCTION
FROM node:18-alpine as prod

WORKDIR /app

ENV NODE_ENV production


COPY --chown=node:node --from=build /app/database.sql dist/database.sql
COPY --chown=node:node --from=build /app/dist dist
COPY --chown=node:node --from=build /app/node_modules node_modules

USER node

CMD ["node", "dist/final.cjs"]