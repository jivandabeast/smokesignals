FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

EXPOSE 5173

CMD ["sh", "-c", "if [ \"$SMOKESIGNALS_ENV\" = \"development\" ]; then npm run dev; else npm run build && npm run preview; fi"]
