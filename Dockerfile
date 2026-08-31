FROM node:20-bookworm
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends default-jdk && rm -rf /var/lib/apt/lists/*
COPY . .
EXPOSE 10000
CMD ["node", "engineers-odyssey-server.js"]
