# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY prisma ./prisma/
COPY src ./src/
RUN npx prisma generate
RUN npm run build
COPY src/infra/redis/scripts ./dist/infra/redis/scripts

# Production stage
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci --only=production
COPY prisma ./prisma/
COPY public ./public
COPY --from=builder /app/dist ./dist
RUN npx prisma generate

EXPOSE 3000
CMD ["npm", "run", "start"]
