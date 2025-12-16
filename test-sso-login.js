#!/usr/bin/env node

const jwt = require('jsonwebtoken');
const http = require('http');
const { exec } = require('child_process');

// Configuration
const JWT_SECRET = 'bc6826cbca2987e810984a196480f150a68c319e8e78121cbc0409e7cdc4be55';
const API_URL = 'http://localhost:3000';
const UI_URL = 'http://localhost:4200';

// Test user data
const testUser = {
  email: 'kyle@thepinnaclelifegroup.com',
  firstName: 'Kyle',
  lastName: 'Hagler',
  externalId: '550e8400-e29b-41d4-a716-446655440000'
};

// Generate JWT token
function generateToken() {
  return jwt.sign(testUser, JWT_SECRET, {
    expiresIn: '5m',
    issuer: 'activepieces'
  });
}

// Perform SSO authentication
async function performSSO(token) {
  const fetch = (await import('node-fetch')).default;

  try {
    const response = await fetch(`${API_URL}/v1/authentication/sso`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'SSO authentication failed');
    }

    const data = await response.json();
    console.log('✅ SSO Success!');
    console.log('User ID:', data.id);
    console.log('Email:', data.email);
    console.log('Project ID:', data.projectId);
    console.log('Platform ID:', data.platformId);

    return data;
  } catch (error) {
    console.error('❌ SSO Error:', error.message);
    throw error;
  }
}

// Create a local server to handle the login flow
function createLoginServer(authToken, projectId) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/login') {
        // Serve a page that sets the token and redirects
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Logging in...</title>
            <style>
              body {
                font-family: sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: #f5f5f5;
              }
              .container { text-align: center; }
              .spinner {
                border: 3px solid #f3f3f3;
                border-top: 3px solid #6366f1;
                border-radius: 50%;
                width: 50px;
                height: 50px;
                animation: spin 1s linear infinite;
                margin: 0 auto 20px;
              }
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="spinner"></div>
              <h2>Logging you into ActivePieces...</h2>
            </div>
            <script>
              // Store the token in localStorage
              localStorage.setItem('token', '${authToken}');

              // Redirect to ActivePieces
              setTimeout(() => {
                window.location.href = '${UI_URL}/projects/${projectId}/flows';
              }, 1000);
            </script>
          </body>
          </html>
        `;

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);

        // Close server after serving the page
        setTimeout(() => {
          server.close();
          resolve();
        }, 2000);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(8080, () => {
      console.log('🌐 Login server running on http://localhost:8080/login');
    });
  });
}

// Main function
async function main() {
  try {
    console.log('🔐 ActivePieces SSO Auto-Login Test');
    console.log('=====================================\n');

    // Step 1: Generate JWT token
    console.log('1️⃣ Generating JWT token...');
    const token = generateToken();
    console.log('Token generated successfully\n');

    // Step 2: Perform SSO authentication
    console.log('2️⃣ Authenticating with ActivePieces...');
    const authData = await performSSO(token);
    console.log('');

    // Step 3: Ask user how to proceed
    console.log('Choose an option:');
    console.log('1. Open browser with automatic login (recommended)');
    console.log('2. Copy token to clipboard for manual use');
    console.log('3. Display token for manual copying');

    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    readline.question('\nEnter your choice (1-3): ', async (answer) => {
      switch(answer) {
        case '1':
          console.log('\n3️⃣ Opening browser...');
          console.log('\n⚠️  Due to browser security, automatic token injection requires manual steps:');
          console.log('1. The browser will open to the ActivePieces sign-in page');
          console.log('2. Open Developer Tools (Cmd+Option+I on Mac, F12 on Windows)');
          console.log('3. Go to the Console tab');
          console.log('4. Paste this command and press Enter:\n');
          console.log(`localStorage.setItem('token', '${authData.token}');`);
          console.log('\n5. Refresh the page (Cmd+R or F5)');
          console.log('\nYou will be logged in as:', authData.email);

          // Open browser to the app
          const openCommand = process.platform === 'darwin' ? 'open' :
                            process.platform === 'win32' ? 'start' : 'xdg-open';
          exec(`${openCommand} ${UI_URL}`);
          break;

        case '2':
          // Copy to clipboard (macOS)
          if (process.platform === 'darwin') {
            exec(`echo "${authData.token}" | pbcopy`);
            console.log('\n✅ Token copied to clipboard!');
            console.log('Paste it in the browser console:');
            console.log(`localStorage.setItem('token', '<paste-here>');`);
            console.log(`Then navigate to: ${UI_URL}/flows`);
          } else {
            console.log('\n⚠️ Clipboard copy only works on macOS');
            console.log('Token:', authData.token);
          }
          break;

        case '3':
        default:
          console.log('\n📋 Authentication Token:');
          console.log('='.repeat(50));
          console.log(authData.token);
          console.log('='.repeat(50));
          console.log('\nTo use this token:');
          console.log('1. Open browser developer tools (F12)');
          console.log('2. Go to Console tab');
          console.log('3. Paste this command:');
          console.log(`localStorage.setItem('token', '${authData.token}');`);
          console.log(`4. Navigate to: ${UI_URL}/flows`);
          break;
      }

      readline.close();
    });

  } catch (error) {
    console.error('Failed:', error.message);
    process.exit(1);
  }
}

// Check if node-fetch is installed
try {
  require.resolve('node-fetch');
  main();
} catch(e) {
  console.log('📦 Installing required dependencies...');
  require('child_process').execSync('npm install node-fetch', { stdio: 'inherit' });
  main();
}