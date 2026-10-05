import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';
import ws from 'ws';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

neonConfig.webSocketConstructor = ws;

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not configured');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  try {
    // 创建迁移记录表
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "_migrations" (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // 读取迁移文件
    const migrationsDir = join(process.cwd(), 'db', 'migrations');
    const files = await readdir(migrationsDir);
    const sqlFiles = files
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`📂 Found ${sqlFiles.length} migration files\n`);

    // 获取已执行的迁移
    const executedResult = await db.execute(sql`
      SELECT filename FROM "_migrations" ORDER BY id
    `);
    const executed = new Set(executedResult.rows.map((r: any) => r.filename));

    let appliedCount = 0;

    // 按顺序执行迁移
    for (const filename of sqlFiles) {
      if (executed.has(filename)) {
        console.log(`⏭️  ${filename} (already applied)`);
        continue;
      }

      console.log(`🔄 Applying ${filename}...`);
      
      const filepath = join(migrationsDir, filename);
      const content = await readFile(filepath, 'utf-8');

      try {
        // 在事务中执行迁移
        await db.transaction(async (tx) => {
          // 执行迁移 SQL
          await tx.execute(sql.raw(content));
          
          // 记录迁移
          await tx.execute(sql`
            INSERT INTO "_migrations" (filename) VALUES (${filename})
          `);
        });

        console.log(`✅ ${filename} applied successfully\n`);
        appliedCount++;
      } catch (error) {
        console.error(`❌ Failed to apply ${filename}:`, error);
        throw error;
      }
    }

    if (appliedCount === 0) {
      console.log('✨ All migrations are up to date');
    } else {
      console.log(`\n✅ Applied ${appliedCount} migration(s) successfully`);
    }

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
