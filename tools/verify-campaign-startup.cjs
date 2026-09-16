const Database = require('better-sqlite3');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

// Usage: node tools/verify-campaign-startup.cjs <live database path>
// Open production READ-ONLY, snapshot using SQLite's backup API, and start only
// the copy. No campaign values or credentials are printed into the report.
const root = path.resolve(__dirname, '..');
const source = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.existsSync(source))
  throw new Error('Supply an existing database path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-compat-'));
const database = path.join(temp, 'game.db');
const fingerprint = (filename) => {
  const db = new Database(filename, { readonly: true, fileMustExist: true });
  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all();
    return Object.fromEntries(
      tables.map(({ name }) => {
        const rows = db
          .prepare(
            `SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`,
          )
          .all();
        return [
          name,
          {
            rows: rows.length,
            sha256: crypto
              .createHash('sha256')
              .update(JSON.stringify(rows))
              .digest('hex'),
          },
        ];
      }),
    );
  } finally {
    db.close();
  }
};
(async () => {
  const live = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await live.backup(database);
  } finally {
    live.close();
  }
  const before = fingerprint(database);
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', 'server/src/index.ts'],
    {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        DATA_ROOT: temp,
        DB_PATH: database,
        PORT: '4275',
      DND_HOST: '127.0.0.1',
        PUBLIC_URL: 'http://127.0.0.1:4275',
        DM_PASSPHRASE: 'isolated-compatibility-check',
        OLLAMA_URL: 'http://127.0.0.1:1',
        COMFY_URL: 'http://127.0.0.1:1',
        GEMINI_API_KEY: '',
        AI_MODE: 'local',
        BACKUP_INTERVAL_DAYS: '365000',
      },
    },
  );
  let output = '';
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  try {
    let healthy = false;
    for (let n = 0; n < 60; n++) {
      if (child.exitCode !== null)
        throw new Error('Isolated server exited before health check');
      try {
        healthy = (
          await (await fetch('http://127.0.0.1:4275/api/health')).json()
        ).ok;
      } catch {}
      if (healthy) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    if (!healthy || !output.includes('server listening'))
      throw new Error('Isolated server did not pass health check');
    const after = fingerprint(database);
    const changed = Object.keys({ ...before, ...after }).filter(
      (t) => JSON.stringify(before[t]) !== JSON.stringify(after[t]),
    );
    const report = {
      sourceOpenedReadOnly: true,
      sandbox: temp,
      health: true,
      changedTables: changed,
      before,
      after,
    };
    fs.mkdirSync(path.join(root, 'preview-evidence'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'preview-evidence/startup-compatibility.json'),
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify(
        {
          health: true,
          changedTables: changed,
          tableCount: Object.keys(before).length,
          rows: Object.values(before).reduce((n, t) => n + t.rows, 0),
        },
        null,
        2,
      ),
    );
    if (changed.length) process.exitCode = 1;
  } finally {
    child.kill();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
