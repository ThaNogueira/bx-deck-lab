FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate

COPY server ./server
COPY public ./public

ENV NODE_ENV=production
EXPOSE 3000

# Migra, semeia (idempotente) e sobe. O banco fica no volume /app/data.
CMD ["sh", "-c", "npx prisma migrate deploy && node server/seed.js && node server/index.js"]
