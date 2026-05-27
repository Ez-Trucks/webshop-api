const { randomBytes, scryptSync } = require('crypto');

const password = process.argv[2];

if (!password || password.length < 8) {
  console.error('Gebruik: npm run admin:hash -- "jouw-sterk-wachtwoord"');
  process.exit(1);
}

const salt = randomBytes(16).toString('base64url');
const key = scryptSync(password, salt, 64).toString('base64url');

console.log(`scrypt:${salt}:${key}`);
