FROM node:22-alpine
WORKDIR /app

# O Sharp usa as fontes instaladas no sistema para renderizar as artes PNG.
RUN apk add --no-cache fontconfig ttf-dejavu wget \
  && mkdir -p /usr/share/fonts/truetype/bx \
  && wget -q -O /usr/share/fonts/truetype/bx/BarlowCondensed-Bold.ttf https://github.com/google/fonts/raw/main/ofl/barlowcondensed/BarlowCondensed-Bold.ttf \
  && wget -q -O /usr/share/fonts/truetype/bx/BarlowCondensed-SemiBold.ttf https://github.com/google/fonts/raw/main/ofl/barlowcondensed/BarlowCondensed-SemiBold.ttf \
  && fc-cache -f

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate

COPY server ./server
COPY public ./public

ENV NODE_ENV=production
EXPOSE 3000

# Migra, semeia (idempotente) e sobe. O banco fica no volume /app/data.
CMD ["sh", "-c", "npx prisma migrate deploy && node server/seed.js && node server/index.js"]
