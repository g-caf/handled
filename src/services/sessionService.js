import { pool } from '../config/db.js';

export async function getSession(platform) {
  const result = await pool.query(
    'SELECT storage_state_enc, updated_at FROM platform_sessions WHERE platform = $1 AND is_valid = true ORDER BY updated_at DESC LIMIT 1',
    [platform]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return {
    storageState: result.rows[0].storage_state_enc,
    updatedAt: result.rows[0].updated_at,
  };
}

export async function saveSession(platform, storageState) {
  const storageStateStr = typeof storageState === 'string' 
    ? storageState 
    : JSON.stringify(storageState);

  // Check if a session exists for this platform
  const existing = await pool.query(
    'SELECT id FROM platform_sessions WHERE platform = $1 LIMIT 1',
    [platform]
  );

  if (existing.rows.length > 0) {
    // Update existing
    await pool.query(
      `UPDATE platform_sessions 
       SET storage_state_enc = $1, updated_at = NOW(), is_valid = true 
       WHERE platform = $2`,
      [storageStateStr, platform]
    );
  } else {
    // Insert new
    await pool.query(
      `INSERT INTO platform_sessions (id, platform, storage_state_enc, is_valid, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, true, NOW(), NOW())`,
      [platform, storageStateStr]
    );
  }
}

export async function deleteSession(platform) {
  await pool.query(
    'UPDATE platform_sessions SET is_valid = false WHERE platform = $1',
    [platform]
  );
}

export async function listSessions() {
  const result = await pool.query(
    'SELECT platform, updated_at FROM platform_sessions WHERE is_valid = true ORDER BY platform'
  );

  return result.rows.map(row => ({
    platform: row.platform,
    updatedAt: row.updated_at,
    hasSession: true,
  }));
}
