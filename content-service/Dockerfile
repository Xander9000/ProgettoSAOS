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
CMD ["npm", "run", "dev"]
