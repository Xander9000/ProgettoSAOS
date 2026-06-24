import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const ArgsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional()
});

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith('--')) continue;

    const key = current.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }

    args[key] = value;
    i += 1;
  }

  return args;
}

async function main() {
  const parsedArgs = parseArgs(process.argv.slice(2));
  const validated = ArgsSchema.safeParse({
    email: parsedArgs.email ?? process.env.ADMIN_EMAIL,
    password: parsedArgs.password ?? process.env.ADMIN_PASSWORD,
    firstName: parsedArgs.firstName ?? 'Admin',
    lastName: parsedArgs.lastName ?? 'System'
  });

  if (!validated.success) {
    console.error('Usage: npm run create-admin -- --email admin@example.com --password "StrongPassword123!" [--firstName Admin] [--lastName System]');
    console.error(validated.error.issues.map((issue) => `- ${issue.message}`).join('\n'));
    process.exit(1);
  }

  const { email, password, firstName, lastName } = validated.data;

  await prisma.$connect();

  const existingAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (existingAdmin) {
    throw new Error(`An admin already exists: ${existingAdmin.email}`);
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new Error(`User already exists: ${email}`);
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: 'ADMIN',
      firstName,
      lastName,
      isVerified: true,
      preferences: { receiveEmails: true }
    }
  });

  console.log(`Admin created successfully: ${email}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
