export interface MigrationVersion { name: string; sha256: string }

export function validateMigrationHistory(files: MigrationVersion[], applied: MigrationVersion[]): void {
  const byName = new Map(files.map((file) => [file.name, file.sha256]));
  for (const migration of applied) {
    if (!byName.has(migration.name)) throw new Error(`Applied migration missing: ${migration.name}`);
    if (byName.get(migration.name) !== migration.sha256) throw new Error(`Applied migration changed: ${migration.name}`);
  }
}
