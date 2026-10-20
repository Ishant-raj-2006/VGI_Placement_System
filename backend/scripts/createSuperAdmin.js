/**
 * Creates (or promotes) the first Super Admin on a fresh production database - no demo data.
 *   node scripts/createSuperAdmin.js "Full Name" admin@college.edu 'StrongPassw0rd!'
 */
import { connectDb, disconnectDb } from '../src/config/db.js';
import { User } from '../src/models/index.js';
import { hashPassword } from '../src/services/auth.service.js';

const [name, email, password] = process.argv.slice(2);
if (!name || !email || !password) {
  console.error('Usage: node scripts/createSuperAdmin.js "Full Name" email password');
  process.exit(1);
}
if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
  console.error('Password must be at least 10 characters and include upper-case, lower-case and a digit.');
  process.exit(1);
}
await connectDb();
await User.init();
const existing = await User.findOne({ email: email.toLowerCase() });
if (existing) {
  existing.role = 'super_admin';
  existing.accountStatus = 'active';
  existing.passwordHash = await hashPassword(password);
  await existing.save();
  console.log(`Updated existing user ${email} -> super_admin`);
} else {
  await User.create({ name, email, passwordHash: await hashPassword(password), role: 'super_admin', accountStatus: 'active', emailVerifiedAt: new Date() });
  console.log(`Created super admin ${email}`);
}
await disconnectDb();
