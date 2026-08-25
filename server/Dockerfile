FROM node:22-bookworm-slim

WORKDIR /app

# better-sqlite3 ships prebuilt binaries for Debian glibc; no build tools needed
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production PORT=3001
EXPOSE 3001

CMD ["npm", "start"]
