import { Router } from 'express';
import { saveSession, listSessions } from '../services/sessionService.js';

const router = Router();

const PLATFORMS = {
  ubereats: {
    name: 'Uber Eats',
    domain: 'ubereats.com',
    loginUrl: 'https://www.ubereats.com/',
  },
  doordash: {
    name: 'DoorDash',
    domain: 'doordash.com',
    loginUrl: 'https://www.doordash.com/',
  },
  instacart: {
    name: 'Instacart',
    domain: 'instacart.com',
    loginUrl: 'https://www.instacart.com/',
  },
};

// Generate the bookmarklet code
function generateBookmarklet(baseUrl) {
  const code = `
    (function() {
      var cookies = document.cookie;
      var domain = location.hostname.replace('www.', '').split('.').slice(-2).join('.');
      var platform = domain.includes('ubereats') ? 'ubereats' : 
                     domain.includes('doordash') ? 'doordash' : 
                     domain.includes('instacart') ? 'instacart' : null;
      if (!platform) {
        alert('Please run this on Uber Eats, DoorDash, or Instacart.');
        return;
      }
      var data = btoa(unescape(encodeURIComponent(JSON.stringify({
        cookies: cookies,
        origin: location.origin,
        hostname: location.hostname
      }))));
      window.open('${baseUrl}/connect/save?platform=' + platform + '&data=' + encodeURIComponent(data), '_blank');
    })();
  `.replace(/\s+/g, ' ').trim();
  
  return `javascript:${encodeURIComponent(code)}`;
}

router.get('/connect', (req, res) => {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const baseUrl = `${protocol}://${req.get('host')}`;
  const bookmarklet = generateBookmarklet(baseUrl);
  
  res.render('connect', {
    title: 'Connect Platforms',
    platforms: PLATFORMS,
    bookmarklet,
    baseUrl,
  });
});

// API endpoint to check connection status
router.get('/connect/status', async (req, res) => {
  try {
    const sessions = await listSessions();
    const status = Object.keys(PLATFORMS).map(platform => ({
      platform,
      connected: sessions.some(s => s.platform === platform),
    }));
    res.json(status);
  } catch (err) {
    // Table might not exist yet
    res.json(Object.keys(PLATFORMS).map(platform => ({
      platform,
      connected: false,
    })));
  }
});

// GET endpoint for bookmarklet redirect
router.get('/connect/save', async (req, res) => {
  try {
    const { platform, data } = req.query;
    
    if (!platform || !data) {
      return res.send(errorPage('Missing data'));
    }
    
    if (!PLATFORMS[platform]) {
      return res.send(errorPage('Invalid platform'));
    }
    
    // Decode the base64 data
    const decoded = JSON.parse(decodeURIComponent(escape(atob(data))));
    
    // Parse cookies string into array
    const cookies = decoded.cookies.split(';').filter(c => c.trim()).map(c => {
      const parts = c.trim().split('=');
      return { name: parts[0], value: parts.slice(1).join('='), domain: decoded.hostname };
    });
    
    const storageState = {
      cookies: cookies,
      origins: [{ origin: decoded.origin, localStorage: [] }]
    };
    
    await saveSession(platform, storageState);
    
    const platformName = PLATFORMS[platform].name;
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Connected!</title>
        <style>
          body { font-family: system-ui; background: #0a0a0a; color: #f5f5f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
          .card { background: #1a1a1a; padding: 3rem; border-radius: 8px; text-align: center; max-width: 400px; }
          h1 { color: #c9a962; margin-bottom: 1rem; }
          p { color: #a0a0a0; margin-bottom: 2rem; }
          a { display: inline-block; padding: 1rem 2rem; background: #c9a962; color: #0a0a0a; text-decoration: none; margin-top: 1rem; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>✓ Connected!</h1>
          <p>${platformName} has been connected to Handled.</p>
          <p>You can close this tab and the ${platformName} tab.</p>
          <a href="/shop">Go to Shop</a>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Error saving session:', err);
    res.send(errorPage('Failed to save: ' + err.message));
  }
});

// Helper for atob in Node
function atob(str) {
  return Buffer.from(str, 'base64').toString('binary');
}

router.get('/connect/popup/:platform', (req, res) => {
  const { platform } = req.params;
  const config = PLATFORMS[platform];
  
  if (!config) {
    return res.status(400).send('Invalid platform');
  }
  
  res.render('connect-popup', {
    title: `Connect ${config.name}`,
    platform,
    config,
  });
});

// CORS-enabled endpoint to receive session data from bookmarklet
router.post('/connect/receive', (req, res) => {
  // Set CORS headers for bookmarklet
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  
  handleReceive(req, res);
});

router.options('/connect/receive', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

async function handleReceive(req, res) {
  try {
    const { platform, storageState } = req.body;
    
    if (!platform || !storageState) {
      return res.json({ success: false, error: 'Missing data' });
    }
    
    if (!PLATFORMS[platform]) {
      return res.json({ success: false, error: 'Invalid platform' });
    }
    
    await saveSession(platform, storageState);
    
    res.json({ success: true, platform });
  } catch (err) {
    console.error('Error saving session:', err);
    res.json({ success: false, error: err.message });
  }
}

// Form-based endpoint (bypasses CORS)
router.post('/connect/receive-form', async (req, res) => {
  try {
    const { platform, storageState } = req.body;
    
    if (!platform || !storageState) {
      return res.send(errorPage('Missing data'));
    }
    
    if (!PLATFORMS[platform]) {
      return res.send(errorPage('Invalid platform'));
    }
    
    const parsed = typeof storageState === 'string' ? JSON.parse(storageState) : storageState;
    await saveSession(platform, parsed);
    
    const platformName = PLATFORMS[platform].name;
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Connected!</title>
        <style>
          body { font-family: system-ui; background: #0a0a0a; color: #f5f5f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
          .card { background: #1a1a1a; padding: 3rem; border-radius: 8px; text-align: center; max-width: 400px; }
          h1 { color: #c9a962; margin-bottom: 1rem; }
          p { color: #a0a0a0; margin-bottom: 2rem; }
          a { color: #c9a962; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>✓ Connected!</h1>
          <p>${platformName} has been connected to Handled. You can close this tab and the ${platformName} tab.</p>
          <p><a href="/shop">Go to Shop →</a></p>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Error saving session:', err);
    res.send(errorPage(err.message));
  }
});

function errorPage(message) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Connection Error</title>
      <style>
        body { font-family: system-ui; background: #0a0a0a; color: #f5f5f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
        .card { background: #1a1a1a; padding: 3rem; border-radius: 8px; text-align: center; max-width: 400px; }
        h1 { color: #cc4444; margin-bottom: 1rem; }
        p { color: #a0a0a0; }
        a { color: #c9a962; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Connection Error</h1>
        <p>${message}</p>
        <p><a href="/connect">Try again →</a></p>
      </div>
    </body>
    </html>
  `;
}

export default router;
