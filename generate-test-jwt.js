#!/usr/bin/env node

const jwt = require('jsonwebtoken');

// Configuration - matches what's in ActivePieces .env
const JWT_SECRET = 'bc6826cbca2987e810984a196480f150a68c319e8e78121cbc0409e7cdc4be55';

// Test user data - you can modify these values
const testUser = {
  email: 'testuser@example.com',
  firstName: 'Test',
  lastName: 'User',
  externalId: 'score-user-123456'
};

// Generate JWT token
const token = jwt.sign(testUser, JWT_SECRET, {
  expiresIn: '5m', // 5 minutes expiration
  issuer: 'activepieces'  // ActivePieces validates this issuer
});

console.log('=== JWT Token for Testing ===\n');
console.log(token);
console.log('\n=== Decoded Payload ===\n');
console.log(JSON.stringify(testUser, null, 2));
console.log('\n=== Use this token in Postman ===');
console.log('It will expire in 5 minutes from now:', new Date(Date.now() + 5 * 60 * 1000).toISOString());

// Also create a ready-to-use JSON body
const requestBody = {
  token: token
};

console.log('\n=== Complete Request Body for Postman ===\n');
console.log(JSON.stringify(requestBody, null, 2));