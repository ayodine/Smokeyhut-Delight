import fs from 'fs';

const envText = fs.readFileSync('.env', 'utf8');
const lines = envText.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('=')) {
    const parts = line.split('=');
    const key = parts[0].trim();
    const value = parts.slice(1).join('=').trim();
    console.log(`${idx}: [${key}] = [${value}] (length: ${value.length})`);
  }
});
