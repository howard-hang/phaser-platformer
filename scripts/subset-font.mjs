/**
 * 把站酷庆科黄油体收成游戏用得到的字，生成 woff2。
 * 字符来自关卡 JSON、界面字符串，以及 scripts/fonts/extra-chars.txt。
 * 新增关卡名写进 JSON 后，再跑一次就会收进字体。
 */
import { spawnSync } from 'node:child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import subsetFont from 'subset-font';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceFont = path.join(root, 'scripts/fonts/ZCOOLQingKeHuangYou-Regular.ttf');
const extraFile = path.join(root, 'scripts/fonts/extra-chars.txt');
const outFile = path.join(root, 'src/assets/game-font.woff2');
const metaFile = path.join(root, 'scripts/fonts/subset-meta.json');
const cjkOutFile = path.join(root, 'src/assets/game-font-cjk.woff2');
const cjkMetaFile = path.join(root, 'scripts/fonts/cjk-subset-meta.json');
const MAX_BYTES = 500 * 1024;
const CJK_MAX_BYTES = 900 * 1024;

/**
 * 假名、谚文和西班牙语重音。文泉驿微米黑含这些字，并且合成字能收全部件。
 * Apache-2.0。机器上没有这份字体时，沿用已经提交的 woff2。
 */
const CJK_SOURCE_CANDIDATES = [
  path.join(root, 'scripts/fonts/wqy-microhei.ttc'),
  '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
];

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

function cjkSource() {
  return CJK_SOURCE_CANDIDATES.find((item) => fs.existsSync(item)) || null;
}

/** 日语、韩语和西班牙语重音。黄油体没有的字靠这份兜底。 */
export function collectCjkChars() {
  const files = ['ja.json', 'ko.json', 'es.json'].map((name) => path.join(root, 'src/i18n', name));
  const set = new Set();
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const ch of text) {
      if (ch === '\uFEFF') continue;
      if (ch.trim() === '' && ch !== ' ') continue;
      const code = ch.codePointAt(0);
      if (code < 0x80) continue;
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
  await buildCjkSubset();
  return meta;
}

/** 生成日语和韩语兜底字体。机器上没有源字体或 fonttools 时，沿用已经提交的 woff2。 */
export async function buildCjkSubset() {
  const chars = collectCjkChars();
  const source = cjkSource();
  const helper = path.join(root, 'scripts/subset-cjk.py');
  if (!source || !fs.existsSync(helper)) {
    if (!fs.existsSync(cjkOutFile)) {
      throw new Error('找不到 CJK 字体源，也没有现成的 game-font-cjk.woff2');
    }
    return null;
  }
  const probe = spawnSync('python3', ['-c', 'import fontTools'], { encoding: 'utf8' });
  if (probe.status !== 0) {
    if (!fs.existsSync(cjkOutFile)) {
      throw new Error('没有 fonttools，也无法沿用现成的 game-font-cjk.woff2');
    }
    return null;
  }
  const charsFile = path.join(os.tmpdir(), 'fangkuai-cjk-chars.txt');
  const tmpOut = path.join(os.tmpdir(), 'fangkuai-cjk.woff2');
  fs.writeFileSync(charsFile, chars);
  const run = spawnSync('python3', [helper, source, charsFile, tmpOut], { encoding: 'utf8' });
  if (run.status !== 0) {
    throw new Error(run.stderr || run.stdout || 'CJK 子集失败');
  }
  const subset = fs.readFileSync(tmpOut);
  if (subset.length > CJK_MAX_BYTES) {
    throw new Error(`CJK 子集 ${(subset.length / 1024).toFixed(1)}KB，超过 ${CJK_MAX_BYTES / 1024}KB。`);
  }
  const prev = fs.existsSync(cjkOutFile) ? fs.readFileSync(cjkOutFile) : null;
  if (!prev || !prev.equals(subset)) fs.writeFileSync(cjkOutFile, subset);
  const meta = {
    font: 'WenQuanYi Micro Hei',
    license: 'Apache-2.0',
    chars,
    count: [...chars].length,
    bytes: subset.length,
  };
  fs.writeFileSync(cjkMetaFile, `${JSON.stringify(meta, null, 2)}\n`);
  return meta;
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (direct) {
  const meta = await buildSubset();
  console.log(`字体子集 ${meta.count} 字，${(meta.bytes / 1024).toFixed(1)}KB → src/assets/game-font.woff2`);
  if (fs.existsSync(cjkMetaFile)) {
    const cjk = JSON.parse(fs.readFileSync(cjkMetaFile, 'utf8'));
    console.log(`CJK 兜底 ${cjk.count} 字，${(cjk.bytes / 1024).toFixed(1)}KB → src/assets/game-font-cjk.woff2`);
  }
}
