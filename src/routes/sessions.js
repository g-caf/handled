import { Router } from 'express';
import { listSessions, saveSession, deleteSession, getSession } from '../services/sessionService.js';
import { getAllPlatformStatus } from '../worker/rateLimiter.js';

const router = Router();

const PLATFORMS = ['ubereats', 'doordash', 'instacart'];

router.get('/sessions', async (req, res) => {
  try {
    const sessions = await listSessions();
    const statuses = getAllPlatformStatus();

    const platformNames = {
      ubereats: 'Uber Eats',
      doordash: 'DoorDash',
      instacart: 'Instacart',
    };

    const platforms = PLATFORMS.map(platform => {
      const session = sessions.find(s => s.platform === platform);
      const status = statuses.find(s => s.platform === platform);

      return {
        platform,
        displayName: platformNames[platform] || platform,
        hasSession: !!session,
        sessionUpdatedAt: session?.updatedAt || null,
        status: status || null,
      };
    });

    res.render('sessions', { platforms });
  } catch (err) {
    console.error('Error loading sessions:', err);
    res.status(500).send('Error loading sessions');
  }
});

router.post('/sessions/:platform/upload', async (req, res) => {
  try {
    const { platform } = req.params;

    if (!PLATFORMS.includes(platform)) {
      return res.status(400).send('Invalid platform');
    }

    const { storageState } = req.body;

    if (!storageState) {
      return res.status(400).send('Missing storageState');
    }

    let parsed;
    try {
      parsed = typeof storageState === 'string' ? JSON.parse(storageState) : storageState;
    } catch {
      return res.status(400).send('Invalid JSON in storageState');
    }

    await saveSession(platform, parsed);
    res.redirect('/sessions');
  } catch (err) {
    console.error('Error saving session:', err);
    res.status(500).send('Error saving session');
  }
});

router.post('/sessions/:platform/delete', async (req, res) => {
  try {
    const { platform } = req.params;
    await deleteSession(platform);
    res.redirect('/sessions');
  } catch (err) {
    console.error('Error deleting session:', err);
    res.status(500).send('Error deleting session');
  }
});

export default router;
