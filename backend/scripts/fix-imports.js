const fs = require('fs').promises;
const path = require('path');

(async () => {
  const root = path.join(process.cwd(), 'src');

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && full.endsWith('.ts')) {
        const text = await fs.readFile(full, 'utf8');
        const newText = text
          .split('\n')
          .map((line) =>
            line.trim().startsWith('import') && line.includes('.ts')
              ? line.replace(/\.ts/g, '.js')
              : line
          )
          .join('\n');
        if (newText !== text) {
          await fs.writeFile(full, newText, 'utf8');
          console.log('updated', full);
        }
      }
    }
  }

  await walk(root);
})();
