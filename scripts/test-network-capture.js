import { chromium } from 'playwright';

async function testNetworkCapture() {
  console.log('Starting network capture test...\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  const page = await context.newPage();
  const capturedResponses = [];
  
  // Set up response listener
  page.on('response', async (response) => {
    const url = response.url();
    const status = response.status();
    const contentType = response.headers()['content-type'] || '';
    
    // Filter for API-like responses
    const isApiLike = url.includes('api') || 
                      url.includes('/v1/') || 
                      url.includes('/v2/') ||
                      url.includes('graphql') ||
                      url.includes('.json');
    
    if (isApiLike && status === 200 && contentType.includes('json')) {
      try {
        const json = await response.json();
        capturedResponses.push({
          url: url.substring(0, 100),
          dataPreview: JSON.stringify(json).substring(0, 200),
          keys: typeof json === 'object' ? Object.keys(json) : []
        });
        console.log(`Captured: ${url.substring(0, 80)}...`);
      } catch (e) {
        // Not valid JSON
      }
    }
  });
  
  // Test with a public API site - using httpbin as example
  console.log('Testing with httpbin.org...\n');
  await page.goto('https://httpbin.org/json');
  await page.waitForTimeout(2000);
  
  console.log('\n--- Testing with a news site API ---\n');
  await page.goto('https://hacker-news.firebaseio.com/v0/topstories.json');
  await page.waitForTimeout(2000);
  
  console.log('\n=== Capture Results ===');
  console.log(`Total API responses captured: ${capturedResponses.length}\n`);
  
  for (const resp of capturedResponses) {
    console.log('URL:', resp.url);
    console.log('Keys:', resp.keys.join(', '));
    console.log('Preview:', resp.dataPreview);
    console.log('---');
  }
  
  await browser.close();
  console.log('\nTest complete.');
}

testNetworkCapture().catch(console.error);
