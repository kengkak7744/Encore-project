FROM node:24-alpine
WORKDIR /app
ARG SERVER_ORIGIN=http://api:4000
ENV SERVER_ORIGIN=$SERVER_ORIGIN
COPY package*.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/web apps/web
RUN npm run build -w @artist-tracker/web
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@artist-tracker/web"]
