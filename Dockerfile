FROM mcr.microsoft.com/playwright:v1.57.0-noble

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

# Install Playwright browsers
RUN npx playwright install chromium

EXPOSE 3000
CMD ["node", "scripts/start.js"]
