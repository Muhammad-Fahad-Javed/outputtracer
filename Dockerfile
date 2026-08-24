FROM node:22-bookworm-slim

WORKDIR /app

# Install system dependencies required for the app:
# - g++ for compiling C++ code
# - gdb for the predictable trace feature
RUN apt-get update && apt-get install -y \
    g++ \
    gdb \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the Next.js application
RUN npm run build

# Set the environment to production
ENV NODE_ENV=production
ENV PORT=3000

# Expose the port the app runs on
EXPOSE 3000

# Start the custom Next.js server
CMD ["npm", "start"]
