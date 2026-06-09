FROM node:18-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

# Rebuild SQLite3 for the container's architecture
RUN npm rebuild sqlite3

RUN addgroup -g 1001 -S nodejs && \
    adduser -S botuser -u 1001 -G nodejs && \
    chown -R botuser:nodejs /app && \
    chmod 755 /app

USER botuser

CMD ["node", "index_enhanced.js"]
