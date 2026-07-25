FROM node:20
WORKDIR /app

# Copy package configuration
COPY package*.json ./

# Install dependencies (better-sqlite3 compiles automatically using pre-installed tools in full node:20 image)
RUN npm install --omit=dev

# Copy the rest of the application files
COPY . .

# Expose port and configure environment
EXPOSE 3002
ENV PORT=3002
ENV NODE_ENV=production

CMD ["npm", "start"]
