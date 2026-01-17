import { Router } from 'express';
import { saveSession } from '../services/sessionService.js';

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
      var cookies = document.cookie.split(';').map(function(c) {
        var parts = c.trim().split('=');
        return { name: parts[0], value: parts.slice(1).join('='), domain: location.hostname };
      });
      var data = {
        cookies: cookies,
        origins: [{
          origin: location.origin,
          localStorage: Object.keys(localStorage).map(function(k) {
            return { name: k, value: localStorage.getItem(k) };
          })
        }]
      };
      var domain = location.hostname.replace('www.', '').split('.').slice(-2).join('.');
      var platform = domain.includes('ubereats') ? 'ubereats' : 
                     domain.includes('doordash') ? 'doordash' : 
                     domain.includes('instacart') ? 'instacart' : null;
      if (!platform) {
        alert('Please run this on Uber Eats, DoorDash, or Instacart');
        return;
      }
      fetch('${baseUrl}/connect/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: platform, storageState: data }),
        mode: 'cors',
        credentials: 'include'
      })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.success) {
          alert('✓ Connected to Handled! You can close this tab.');
        } else {
          alert('Error: ' + (d.error || 'Unknown error'));
        }
      })
      .catch(function(e) {
        alert('Connection failed. Please try again.');
      });
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

export default router;
