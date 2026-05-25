const { openDb, initSchema, DB_PATH } = require('./db');

(async () => {
  const db = openDb();
  try {
    await initSchema(db);
    console.log(`Database initialized: ${DB_PATH}`);
  } catch (err) {
    console.error('Failed to initialize database:', err.message);
    process.exitCode = 1;
  } finally {
    db.close();
  }
})();
