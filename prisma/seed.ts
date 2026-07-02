import { PrismaClient, Role, Plan, LimitType, Algorithm } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Create Admin User
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@rateguard.io';
  const adminPassword = process.env.ADMIN_PASSWORD || 'AdminSecurePassword123!';
  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
      plan: Plan.ENTERPRISE,
    },
  });
  console.log(`Admin user created/verified: ${admin.email}`);

  // 2. Create standard FREE and PREMIUM users for testing
  const freeEmail = 'free@rateguard.io';
  const freeUser = await prisma.user.upsert({
    where: { email: freeEmail },
    update: {},
    create: {
      email: freeEmail,
      passwordHash: await bcrypt.hash('FreeUserPassword123!', 10),
      role: Role.USER,
      plan: Plan.FREE,
    },
  });
  console.log(`Free user created/verified: ${freeUser.email}`);

  const premiumEmail = 'premium@rateguard.io';
  const premiumUser = await prisma.user.upsert({
    where: { email: premiumEmail },
    update: {},
    create: {
      email: premiumEmail,
      passwordHash: await bcrypt.hash('PremiumUserPassword123!', 10),
      role: Role.USER,
      plan: Plan.PREMIUM,
    },
  });
  console.log(`Premium user created/verified: ${premiumUser.email}`);

  // 3. Create API Keys for the users
  const freeApiKey = await prisma.apiKey.upsert({
    where: { key: 'rateguard_free_api_key_sample' },
    update: {},
    create: {
      key: 'rateguard_free_api_key_sample',
      label: 'Default Free API Key',
      userId: freeUser.id,
      active: true,
    },
  });
  console.log(`Free API Key verified: ${freeApiKey.key}`);

  const premiumApiKey = await prisma.apiKey.upsert({
    where: { key: 'rateguard_premium_api_key_sample' },
    update: {},
    create: {
      key: 'rateguard_premium_api_key_sample',
      label: 'Default Premium API Key',
      userId: premiumUser.id,
      active: true,
    },
  });
  console.log(`Premium API Key verified: ${premiumApiKey.key}`);

  // 4. Create Rate Limit Rules
  console.log('Seeding rate limit rules...');

  // Clean existing rules to avoid duplicate seeding errors in clean environment
  await prisma.rateLimitRule.deleteMany({});

  const rules = [
    // Plan-based rules
    {
      name: 'Free Plan Rule (Default)',
      limitBy: LimitType.PLAN,
      value: Plan.FREE,
      algorithm: Algorithm.TOKEN_BUCKET,
      limitValue: 10,
      windowSize: 60,
      bucketCapacity: 10,
      refillRate: 0.1667, // ~10 per min (10 / 60)
    },
    {
      name: 'Premium Plan Rule',
      limitBy: LimitType.PLAN,
      value: Plan.PREMIUM,
      algorithm: Algorithm.TOKEN_BUCKET,
      limitValue: 100,
      windowSize: 60,
      bucketCapacity: 100,
      refillRate: 1.667, // ~100 per min (100 / 60)
    },
    {
      name: 'Enterprise Plan Rule',
      limitBy: LimitType.PLAN,
      value: Plan.ENTERPRISE,
      algorithm: Algorithm.TOKEN_BUCKET,
      limitValue: 1000,
      windowSize: 60,
      bucketCapacity: 1000,
      refillRate: 16.67, // ~1000 per min
    },
    // Endpoint-specific rules using various algorithms
    {
      name: 'Sensitive Path Rate Limit (Fixed Window)',
      limitBy: LimitType.ENDPOINT,
      value: '/api/v1/test/auth/login',
      algorithm: Algorithm.FIXED_WINDOW,
      limitValue: 5,
      windowSize: 60,
    },
    {
      name: 'Heavy Data Processing (Leaky Bucket)',
      limitBy: LimitType.ENDPOINT,
      value: '/api/v1/test/heavy',
      algorithm: Algorithm.LEAKY_BUCKET,
      limitValue: 5,
      windowSize: 10,
      bucketCapacity: 5,
      refillRate: 0.5, // Leak 1 request per 2 seconds
    },
    {
      name: 'Search Endpoint (Sliding Window Counter)',
      limitBy: LimitType.ENDPOINT,
      value: '/api/v1/test/search',
      algorithm: Algorithm.SLIDING_WINDOW_COUNTER,
      limitValue: 10,
      windowSize: 30, // 10 requests per 30s
    },
    {
      name: 'Transactional Endpoint (Sliding Window Log)',
      limitBy: LimitType.ENDPOINT,
      value: '/api/v1/test/payment/checkout',
      algorithm: Algorithm.SLIDING_WINDOW_LOG,
      limitValue: 3,
      windowSize: 10, // 3 requests per 10s
    },
  ];

  for (const rule of rules) {
    const created = await prisma.rateLimitRule.create({
      data: rule,
    });
    console.log(`Seeded rule: ${created.name} (${created.algorithm})`);
  }

  console.log('Database seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
