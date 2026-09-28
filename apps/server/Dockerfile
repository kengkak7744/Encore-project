FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/server apps/server
RUN npm run build -w @artist-tracker/server

FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/server/sql apps/server/sql
EXPOSE 4000
CMD ["npm", "run", "start:api", "-w", "@artist-tracker/server"]
