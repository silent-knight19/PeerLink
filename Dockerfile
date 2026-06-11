FROM node:20-alpine AS build
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY client/package.json client/tsconfig.json client/
COPY server/package.json server/tsconfig.json server/
RUN npm install

COPY . .
RUN npm run build

FROM node:20-alpine AS run
WORKDIR /app
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/package.json ./server/
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/node_modules ./server/node_modules

EXPOSE 4000
CMD ["node", "server/dist/app.js"]
