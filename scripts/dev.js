const { createServer } = require('vite');
const { spawn } = require('child_process');
const electronPath = require('electron');
const path = require('path');

async function start() {
  // 1. Start Vite development server
  const server = await createServer({
    configFile: path.resolve(__dirname, '../vite.config.js'),
    root: path.resolve(__dirname, '../'),
  });
  
  await server.listen();
  
  const address = server.httpServer.address();
  const port = address.port;
  const devUrl = `http://localhost:${port}`;
  
  console.log(`[Vite] Server started at ${devUrl}`);

  // 2. Start Electron process
  const electronProcess = spawn(electronPath, ['.'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: devUrl,
      NODE_ENV: 'development'
    }
  });

  electronProcess.on('close', () => {
    console.log('[Electron] Closed, exiting...');
    server.close();
    process.exit();
  });
}

start().catch((err) => {
  console.error('Error starting dev environment:', err);
  process.exit(1);
});
