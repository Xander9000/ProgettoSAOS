FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm install
COPY prisma ./prisma/
RUN rm -rf node_modules/.prisma
RUN npm rebuild @prisma/client
RUN npx prisma generate
COPY . .
RUN rm -rf node_modules/.cache
RUN rm -rf .ts-node
CMD ["npm", "run", "dev"]
