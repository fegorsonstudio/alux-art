FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
COPY server.js ./
COPY public ./public
COPY supabase ./supabase

RUN mkdir -p data storage/previews storage/downloads storage/zip storage/instagram

EXPOSE 3000

CMD ["node", "server.js"]
