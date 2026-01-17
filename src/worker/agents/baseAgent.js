import { chromium } from 'playwright';

export async function createBrowserContext(storageState = null) {
  const browser = await chromium.launch({ headless: true });
  
  const contextOptions = {
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };
  
  if (storageState) {
    contextOptions.storageState = storageState;
  }
  
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  
  return { browser, context, page };
}

export function randomDelay(min = 500, max = 1500) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

export async function waitForNetworkIdle(page, timeout = 5000) {
  try {
    await page.waitForLoadState('networkidle', { timeout });
  } catch (e) {
    // Network may never fully idle on dynamic sites, continue anyway
  }
}

export function createApiResponseCollector(page, urlPatterns = ['api', 'items', 'menu', 'catalog', 'products']) {
  const responses = [];
  
  const listener = async (response) => {
    const url = response.url();
    const matchesPattern = urlPatterns.some(pattern => url.toLowerCase().includes(pattern));
    
    if (matchesPattern && response.status() === 200) {
      const contentType = response.headers()['content-type'] || '';
      if (contentType.includes('application/json')) {
        try {
          const json = await response.json();
          responses.push({
            url,
            data: json,
            timestamp: Date.now()
          });
        } catch (e) {
          // Not valid JSON, skip
        }
      }
    }
  };
  
  page.on('response', listener);
  
  return {
    getResponses: () => responses,
    stop: () => page.removeListener('response', listener)
  };
}
