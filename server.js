'use strict';

const { spawn } = require('node:child_process');

const app = require('./src/app');
const config = require('./src/config');
const { closeDb } = require('./src/db');

const baseUrl = `http://${config.host}:${config.port}`;

const server = app.listen(config.port, config.host, () => {
  console.log('');
  console.log(`  OrderFlow v${config.version}`);
  console.log(`  Storefront : ${baseUrl}`);
  console.log(`  Admin      : ${baseUrl}  (use the "Admin Portal" button)`);
  console.log(`  Health     : ${baseUrl}/api/health`);
  console.log('  Press Ctrl+C to stop.');
  console.log('');

  if (config.autoOpen) {
    openBrowser(baseUrl);
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[server] Port ${config.port} is already in use. Set PORT to a free port and retry.`);
  } else {
    console.error('[server] Failed to start:', err);
  }
  closeDb();
  process.exitCode = 1;
});

function openBrowser(url) {
  const platform = process.platform;
  let command;
  let args;

  if (platform === 'win32') {
    command = 'cmd.exe';
    args = ['/c', 'start', '', url];
  } else if (platform === 'darwin') {
    command = 'open';
    args = [url];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.on('error', () => {
      // Opening a browser is a convenience; never crash the server over it.
    });
    child.unref();
  } catch {
    // Ignore browser launch failures.
  }
}

let isShuttingDown = false;

function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[server] ${signal} received — shutting down gracefully.`);
  server.close(() => {
    closeDb();
    console.log('[server] Closed HTTP server and database connection.');
    process.exit(0);
  });

  // Do not let open keep-alive connections block shutdown forever.
  setTimeout(() => {
    closeDb();
    process.exit(0);
  }, 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = server;
