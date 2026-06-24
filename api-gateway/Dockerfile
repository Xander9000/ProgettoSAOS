FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# API Gateway doesn't have prisma
CMD ["npm", "run", "dev"]
