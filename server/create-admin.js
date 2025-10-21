// create-admin.js
import bcrypt from 'bcryptjs';

// Get the password from the command line arguments
const password = process.argv[2];

if (!password) {
  console.error('ERROR: Please provide a password to hash.');
  console.log('Usage: node create-admin.js "YourNewSecurePassword123!"');
  process.exit(1);
}

const saltRounds = 10;
const hashedPassword = bcrypt.hashSync(password, saltRounds);

console.log(`\nPassword to use: ${password}`);
console.log('\n--- Copy the HASH below ---');
console.log(hashedPassword);
console.log('--- End of HASH ---\n');