#!/usr/bin/env node
/**
 * Minimal SSE server for testing subscription manager.
 * Sends a message every 2 seconds.
 */

import http from 'http';

const PORT = 8001;

const server = http.createServer((req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/stream' && req.method === 'GET') {
    console.log('New SSE client connected');

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Send a message every 2 seconds
    const interval = setInterval(() => {
      const data = {
        timestamp: new Date().toISOString(),
        message: 'Hello from SSE server',
      };
      res.write(`event: message\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }, 2000);

    // Clean up on client disconnect
    req.on('close', () => {
      console.log('Client disconnected');
      clearInterval(interval);
    });

  } else if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));

  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Starting SSE server on http://localhost:${PORT}`);
  console.log(`SSE endpoint: http://localhost:${PORT}/stream`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
