import { chromium } from 'playwright';

let sharedBrowser = null;

export async function getBrowser() {
  if (!sharedBrowser || !sharedBrowser.isConnected()) {
    sharedBrowser = await chromium.launch({ headless: true });
  }
  return sharedBrowser;
}

export async function createBrowserContext(storageState = null) {
  const browser = await getBrowser();

  const contextOptions = {
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
  };

  if (storageState) {
    contextOptions.storageState = storageState;
  }

  const context = await browser.newContext(contextOptions);
  context.setDefaultTimeout(15000);
  context.setDefaultNavigationTimeout(30000);

  const page = await context.newPage();

  return { browser, context, page };
}

export async function safeCloseContext(context) {
  try {
    await context?.close();
  } catch {
    // Ignore close errors
  }
}

export function randomDelay(min = 500, max = 1500) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

export async function waitForNetworkIdle(page, timeout = 5000) {
  try {
    await page.waitForLoadState('networkidle', { timeout });
  } catch {
    // Network may never fully idle on dynamic sites
  }
}

export function createApiResponseCollector(page, urlPatterns = [], { maxResponses = 200 } = {}) {
  const responses = [];

  const listener = async (response) => {
    try {
      const url = response.url().toLowerCase();

      if (response.status() !== 200) return;

      const matchesPattern = urlPatterns.length === 0 ||
        urlPatterns.some(pattern => url.includes(pattern.toLowerCase()));
      if (!matchesPattern) return;

      const contentType = response.headers()['content-type'] || '';
      if (!contentType.includes('application/json')) return;

      if (responses.length >= maxResponses) return;

      const json = await response.json().catch(() => null);
      if (json) {
        responses.push({
          url: response.url(),
          data: json,
          timestamp: Date.now()
        });
      }
    } catch {
      // Ignore collection errors
    }
  };

  page.on('response', listener);

  return {
    getResponses: () => responses,
    stop: () => page.off('response', listener)
  };
}

export async function checkForBlock(page) {
  const blockedIndicators = [
    'verify you are human',
    'access denied',
    'please verify',
    'captcha',
    'blocked',
    'too many requests'
  ];

  const pageText = await page.textContent('body').catch(() => '');
  const lowerText = pageText.toLowerCase();

  for (const indicator of blockedIndicators) {
    if (lowerText.includes(indicator)) {
      return { blocked: true, reason: indicator };
    }
  }

  return { blocked: false };
}
