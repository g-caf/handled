import { pool } from '../config/db.js';

export async function getSession(platform) {
  const result = await pool.query(
    'SELECT storage_state, updated_at FROM platform_sessions WHERE platform = $1',
    [platform]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return {
    storageState: result.rows[0].storage_state,
    updatedAt: result.rows[0].updated_at,
  };
}

export async function saveSession(platform, storageState) {
  await pool.query(
    `INSERT INTO platform_sessions (platform, storage_state, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (platform)
     DO UPDATE SET storage_state = $2, updated_at = NOW()`,
    [platform, JSON.stringify(storageState)]
  );
}

export async function deleteSession(platform) {
  await pool.query(
    'DELETE FROM platform_sessions WHERE platform = $1',
    [platform]
  );
}

export async function listSessions() {
  const result = await pool.query(
    'SELECT platform, updated_at FROM platform_sessions ORDER BY platform'
  );

  return result.rows.map(row => ({
    platform: row.platform,
    updatedAt: row.updated_at,
    hasSession: true,
  }));
}
