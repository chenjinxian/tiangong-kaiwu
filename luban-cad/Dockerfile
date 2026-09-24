# LubanCAD Docker Image
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY rush.json ./
COPY common/ ./common/
COPY modules/ ./modules/

# Install rush
RUN npm install -g @microsoft/rush

# Install and build
RUN rush install
RUN rush build

# Expose port
EXPOSE 3000

# Start command
CMD ["npm", "start"]
