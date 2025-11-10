#!/usr/bin/env node

const jwt = require('jsonwebtoken');
const { exec } = require('child_process');

// Configuration
const JWT_SECRET = 'bc6826cbca2987e810984a196480f150a68c319e8e78121cbc0409e7cdc4be55';
const API_URL = 'http://localhost:3000';
const UI_URL = 'http://localhost:4200';

// Test user data
const testUser = {
  email: 'testuser@example.com',
  firstName: 'Test',
  lastName: 'User',
  externalId: 'score-user-123456'
};

async function quickLogin() {
  const fetch = (await import('node-fetch')).default;

  console.log('🔐 ActivePieces Quick SSO Login');
  console.log('================================\n');

  // Generate token
  const token = jwt.sign(testUser, JWT_SECRET, {
    expiresIn: '5m',
    issuer: 'activepieces'
  });

  // Call SSO endpoint
  console.log('Authenticating with ActivePieces...');
  const response = await fetch(`${API_URL}/v1/authentication/sso`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'SSO failed');
  }

  const data = await response.json();

  console.log('✅ Authentication successful!');
  console.log(`   User: ${data.email}`);
  console.log(`   Project ID: ${data.projectId}`);
  console.log('');

  // Create JavaScript to paste in browser console
  const browserScript = `
// ActivePieces SSO Login Script
// Paste this in the browser console at ${UI_URL}

localStorage.setItem('token', '${data.token}');
window.location.href = '/flows';
console.log('✅ Logged in as ${data.email}');
`;

  console.log('📋 TO COMPLETE LOGIN:');
  console.log('1. Open your browser to: ' + UI_URL);
  console.log('2. Open Developer Tools (F12 or right-click → Inspect)');
  console.log('3. Go to the Console tab');
  console.log('4. Paste this code and press Enter:');
  console.log('');
  console.log('─'.repeat(60));
  console.log(browserScript);
  console.log('─'.repeat(60));

  // Copy to clipboard on macOS
  if (process.platform === 'darwin') {
    exec(`echo "localStorage.setItem('token', '${data.token}'); window.location.href = '/flows';" | pbcopy`);
    console.log('\n✅ Script copied to clipboard (macOS)!');
    console.log('   Just paste (Cmd+V) in the browser console.');
  }
}

// Run
quickLogin().catch(console.error);