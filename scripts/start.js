#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runMigrations() {
  console.log('Running database migrations...');
  
  return new Promise((resolve, reject) => {
    const migrate = spawn('node', [join(__dirname, 'migrate.js')], {
      stdio: 'inherit',
      env: process.env,
    });

    migrate.on('close', (code) => {
      if (code === 0) {
        console.log('Migrations complete');
        resolve();
      } else {
        reject(new Error(`Migration failed with code ${code}`));
      }
    });

    migrate.on('error', reject);
  });
}

async function startServer() {
  console.log('Starting server...');
  
  const server = spawn('node', [join(__dirname, '../src/server.js')], {
    stdio: 'inherit',
    env: process.env,
  });

  server.on('error', (err) => {
    console.error('Server error:', err);
    process.exit(1);
  });

  server.on('close', (code) => {
    process.exit(code || 0);
  });
}

async function main() {
  try {
    await runMigrations();
    await startServer();
  } catch (err) {
    console.error('Startup failed:', err.message);
    process.exit(1);
  }
}

main();
