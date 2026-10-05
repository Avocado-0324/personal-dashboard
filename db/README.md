# Database Migrations

This project uses a custom migration system for managing database schema changes.

## Running Migrations

### For Development and Production

Use the same command for both branch databases and production:

```bash
npm run db:migrate
```

This script:
- Reads all `.sql` files from `db/migrations/` in alphabetical order
- Tracks executed migrations in the `_migrations` table
- Skips already-applied migrations (idempotent)
- Executes each migration in a transaction
- Safe to run multiple times

### Environment Setup

Set your database connection string:

```bash
export DATABASE_URL="postgresql://..."
```

For Neon branch databases:
```bash
export DATABASE_URL="postgresql://...@ep-xxx.us-east-2.aws.neon.tech/neondb"
```

## Creating New Migrations

1. Create a new file in `db/migrations/` with a sequential number prefix:
   ```
   db/migrations/0004_add_new_feature.sql
   ```

2. Write your SQL migration:
   ```sql
   ALTER TABLE "some_table" ADD COLUMN "new_field" text;
   CREATE INDEX "new_field_idx" ON "some_table"("new_field");
   ```

3. Update `db/schema.ts` to match the SQL schema:
   - Add new columns
   - Add constraints using `check()`
   - Add indexes using `index()` or `uniqueIndex()`
   - Keep schema and SQL in sync

4. Run the migration:
   ```bash
   npm run db:migrate
   ```

## Important Notes

- **DO NOT** use `drizzle-kit push` for production migrations
- `drizzle-kit push` bypasses the migration tracking system and can cause schema drift
- Always create SQL migration files for schema changes
- Keep `db/schema.ts` in sync with SQL migrations for TypeScript types and safety
- The schema file is used by the application at runtime, not for migrations

## Schema Sync

The `db/schema.ts` file must match the SQL migrations to:
- Provide accurate TypeScript types
- Enable Drizzle ORM features (checks, indexes, foreign keys)
- Prevent `drizzle-kit push` from creating unwanted schema changes

When you add constraints or indexes in SQL, add them to `schema.ts` too:
- `check()` for CHECK constraints
- `uniqueIndex()` for unique indexes (including partial indexes)
- `index()` for regular indexes
- `.references()` for foreign keys
