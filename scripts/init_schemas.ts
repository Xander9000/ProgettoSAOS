import { Client } from 'pg';
import { execSync } from 'child_process';
import path from 'path';

const SCHEMAS = [
  'auth_service_schema',
  'user_service_schema',
  'course_service_schema',
  'content_service_schema',
  'quiz_service_schema',
  'notification_service_schema',
  'audit_service_schema',
];

const SERVICES = [
  { name: 'auth-service', schema: 'auth_service_schema' },
  { name: 'course-service', schema: 'course_service_schema' },
  { name: 'content-service', schema: 'content_service_schema' },
  { name: 'quiz-service', schema: 'quiz_service_schema' },
  { name: 'notification-service', schema: 'notification_service_schema' },
  { name: 'audit-service', schema: 'audit_service_schema' },
];

async function createSchemas() {
  console.log('Connecting to PostgreSQL...');

  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'root',
    password: 'rootpassword',
    database: 'postgres',
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL\n');

    for (const schema of SCHEMAS) {
      console.log(`Creating schema: ${schema}`);
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
      console.log(`  ✓ Schema ${schema} created`);
    }
    console.log('\nAll schemas created successfully!');
  } catch (error) {
    console.error('Error creating schemas:', error);
    throw error;
  } finally {
    await client.end();
  }
}

async function runMigrations() {
  console.log('\nRunning Prisma migrations...\n');

  for (const service of SERVICES) {
    console.log(`Migrating ${service.name}...`);
    try {
      const servicePath = path.join(process.cwd(), service.name);
      execSync('npx prisma migrate dev --name init --skip-seed', {
        cwd: servicePath,
        stdio: 'inherit',
        env: { ...process.env, DATABASE_URL: `postgresql://root:rootpassword@localhost:5432/postgres?schema=${service.schema}` },
      });
      console.log(`✓ ${service.name} migrated successfully!\n`);
    } catch (error) {
      console.error(`Error migrating ${service.name}:`, error);
      throw error;
    }
  }
}

async function main() {
  console.log('=== E-Learning Platform: Database Schema Initialization ===\n');

  await createSchemas();
  await runMigrations();

  console.log('=== Initialization Complete ===');
  console.log('Run "npm run seed:demo" to populate test data.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
