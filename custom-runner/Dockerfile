FROM node:22-alpine
WORKDIR /runner
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts
COPY server.mjs ./
USER node
EXPOSE 8090
CMD ["node", "server.mjs"]
