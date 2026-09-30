/**
 * 把站酷庆科黄油体收成游戏用得到的字，生成 woff2。
 * 字符来自关卡 JSON、界面字符串，以及 scripts/fonts/extra-chars.txt。
 * 新增关卡名写进 JSON 后，再跑一次就会收进字体。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import subsetFont from 'subset-font';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceFont = path.join(root, 'scripts/fonts/ZCOOLQingKeHuangYou-Regular.ttf');
const extraFile = path.join(root, 'scripts/fonts/extra-chars.txt');
const outFile = path.join(root, 'src/assets/game-font.woff2');
const metaFile = path.join(root, 'scripts/fonts/subset-meta.json');
const MAX_BYTES = 500 * 1024;

const ASCII = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';

/** 抽出源码和 JSON 里的字符串，注释不会混进来。 */
export function literalsInSource(source) {
  const found = [];
  const re = /`[^`]*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g;
  for (const match of source.matchAll(re)) found.push(match[0]);
  return found.join('');
}

function walk(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'assets' || entry.name === 'node_modules') continue;
      walk(full, acc);
      continue;
    }
    if (!/\.(js|json|html|css)$/.test(entry.name)) continue;
    acc.push(fs.readFileSync(full, 'utf8'));
  }
}

/** 游戏会显示到的全部字符，排序后拼成一个字符串。 */
export function collectChars() {
  const chunks = [ASCII];
  const files = [];
  walk(path.join(root, 'src'), files);
  files.push(fs.readFileSync(path.join(root, 'index.html'), 'utf8'));
  for (const file of files) chunks.push(literalsInSource(file));
  if (fs.existsSync(extraFile)) chunks.push(fs.readFileSync(extraFile, 'utf8'));
  const set = new Set();
  for (const chunk of chunks) {
    for (const ch of chunk) {
      if (ch === '\uFEFF') continue;
      if (ch.trim() === '' && ch !== ' ') continue;
      set.add(ch);
    }
  }
  set.add(' ');
  return [...set].sort().join('');
}

export async function buildSubset() {
  if (!fs.existsSync(sourceFont)) {
    throw new Error(`找不到字体源文件 ${sourceFont}`);
  }
  const chars = collectChars();
  const font = fs.readFileSync(sourceFont);
  const subset = Buffer.from(await subsetFont(font, chars, { targetFormat: 'woff2' }));
  if (subset.length > MAX_BYTES) {
    throw new Error(`子集 ${(subset.length / 1024).toFixed(1)}KB，超过 500KB。请少收一些字。`);
  }
  const prev = fs.existsSync(outFile) ? fs.readFileSync(outFile) : null;
  if (!prev || !prev.equals(subset)) fs.writeFileSync(outFile, subset);
  const meta = {
    font: 'ZCOOL QingKe HuangYou',
    license: 'OFL-1.1',
    chars,
    count: [...chars].length,
    bytes: subset.length,
  };
  fs.writeFileSync(metaFile, `${JSON.stringify(meta, null, 2)}\n`);
  return meta;
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (direct) {
  const meta = await buildSubset();
  console.log(`字体子集 ${meta.count} 字，${(meta.bytes / 1024).toFixed(1)}KB → src/assets/game-font.woff2`);
}
