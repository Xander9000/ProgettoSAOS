FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm install
COPY prisma ./prisma/
RUN npx prisma generate
ENV PRISMA_ENGINE_PROTOCOL=http
COPY . .
RUN rm -rf node_modules/.cache
CMD ["npm", "run", "dev"]
