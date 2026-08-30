FROM node:20-bookworm
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-21-jdk && rm -rf /var/lib/apt/lists/*
COPY . .
EXPOSE 4173
CMD ["node", "engineers-odyssey-server.js"]
