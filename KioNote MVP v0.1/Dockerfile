FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY sample-data ./sample-data
RUN mkdir -p data && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["npm", "start"]
