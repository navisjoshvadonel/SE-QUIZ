# Multi-stage lightweight production image
FROM node:20-alpine

WORKDIR /app

# Copy project files
COPY package.json ./
COPY server ./server
COPY public ./public

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server/server.js"]
