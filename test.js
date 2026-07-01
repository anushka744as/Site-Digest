const axios = require('axios');
const http = require('http');
const dotenv = require('dotenv');

// Load environment variables (to test keys if present)
dotenv.config();

// We will require server.js or start it programmatically
const express = require('express');
const path = require('path');

// Recreate the server logic here or run it using child process. 
// Starting it in the same process is very simple and easy to shut down.
const app = express();
app.use(express.json());

// Import backend functions directly from server.js? 
// Since server.js exports nothing directly, we can run a child process or we can copy the endpoint logic for testing.
// However, let's start the server as a child process, which is a true black-box integration test!
const { spawn } = require('child_process');

console.log('✦ Site Digest Automated Integration Test ✦');

let serverProcess;
const TEST_PORT = 3001;

function startServer() {
  return new Promise((resolve, reject) => {
    console.log(`Starting server on test port ${TEST_PORT}...`);
    
    serverProcess = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
      env: { ...process.env, PORT: TEST_PORT },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdoutData = '';
    serverProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
      if (stdoutData.includes('listening on port')) {
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`[Server Stderr] ${data}`);
    });

    serverProcess.on('error', (err) => {
      reject(err);
    });

    // Timeout if server doesn't start in 5 seconds
    setTimeout(() => {
      reject(new Error('Server start timed out after 5s'));
    }, 5000);
  });
}

async function runTests() {
  try {
    await startServer();
    console.log('✅ Server started successfully.');

    const testUrl = 'https://example.com';
    console.log(`Sending POST request to summarize: ${testUrl}...`);

    const response = await axios.post(`http://localhost:${TEST_PORT}/api/summarize`, {
      url: testUrl
    }, {
      timeout: 10000 // 10 seconds timeout
    });

    console.log('✅ Received response from server.');
    console.log(`HTTP Status: ${response.status}`);
    
    const data = response.data;
    
    // Assertions
    const assertions = [
      { name: 'Response is an object', check: typeof data === 'object' && data !== null },
      { name: 'Has title', check: typeof data.title === 'string' && data.title.length > 0 },
      { name: 'Has summary', check: typeof data.summary === 'string' && data.summary.length > 0 },
      { name: 'Has targetAudience', check: typeof data.targetAudience === 'string' },
      { name: 'Has keyTakeaways array', check: Array.isArray(data.keyTakeaways) && data.keyTakeaways.length > 0 },
      { name: 'Has topics array', check: Array.isArray(data.topics) && data.topics.length > 0 },
      { name: 'Has demoMode flag', check: typeof data.demoMode === 'boolean' }
    ];

    let passedCount = 0;
    assertions.forEach((assertion) => {
      if (assertion.check) {
        console.log(`  [PASS] ${assertion.name}`);
        passedCount++;
      } else {
        console.error(`  [FAIL] ${assertion.name}`);
      }
    });

    console.log(`\nDigest Mode: ${data.demoMode ? 'DEMO MODE' : 'AI MODE'}`);
    console.log(`Extracted Title: "${data.title}"`);
    console.log(`Description: "${data.description}"`);
    console.log(`Summary snippet: "${data.summary.substring(0, 80)}..."`);
    console.log(`Key Topics: [ ${data.topics.join(', ')} ]`);

    if (passedCount === assertions.length) {
      console.log('\n🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉');
      cleanup(0);
    } else {
      console.error('\n❌ SOME TEST ASSERTIONS FAILED.');
      cleanup(1);
    }

  } catch (error) {
    console.error('\n❌ TEST RUN FAILED with error:', error.message);
    if (error.response) {
      console.error('Response error details:', error.response.data);
    }
    cleanup(1);
  }
}

function cleanup(exitCode) {
  if (serverProcess) {
    console.log('Stopping server process...');
    serverProcess.kill('SIGTERM');
  }
  process.exit(exitCode);
}

runTests();
