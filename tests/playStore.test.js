/**
 * 上架材料：隐私政策、app-ads.txt、正式包开关和 CI 清单检查。
 * 不连商店，也不读密钥。
 */
import fs from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { isAllowedExternalUrl, PRIVACY_POLICY_URL } from '../src/platform/externalLink.js';

const APP_ADS = 'google.com, pub-3218611878548189, DIRECT, f08c47fec0942fa0';

function pngSize(file) {
  const buf = fs.readFileSync(file);
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return {
    w: buf.readUInt32BE(16),
    h: buf.readUInt32BE(20),
    colorType: buf[25],
  };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** 抽样看像素是不是整张一个颜色。宣传图还要在中间同时有浅色和深色。 */
function pngVariety(file) {
  const buf = fs.readFileSync(file);
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 2;
  const idats = [];
  while (offset + 8 <= buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') idats.push(data);
    else if (type === 'IEND') break;
    offset += 12 + len;
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idats));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let src = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[src];
    src += 1;
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    const prior = y === 0 ? Buffer.alloc(stride) : pixels.subarray((y - 1) * stride, y * stride);
    for (let i = 0; i < stride; i += 1) {
      const value = raw[src];
      src += 1;
      const left = i >= channels ? row[i - channels] : 0;
      const up = prior[i];
      const upLeft = i >= channels ? prior[i - channels] : 0;
      let out = value;
      if (filter === 1) out = (value + left) & 255;
      else if (filter === 2) out = (value + up) & 255;
      else if (filter === 3) out = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) out = (value + paeth(left, up, upLeft)) & 255;
      row[i] = out;
    }
  }
  let first = null;
  let colors = 0;
  const seen = new Set();
  let light = false;
  let dark = false;
  const x0 = Math.floor(width * 0.18);
  const x1 = Math.floor(width * 0.82);
  const y0 = Math.floor(height * 0.12);
  const y1 = Math.floor(height * 0.88);
  for (let y = 0; y < height; y += 8) {
    for (let x = 0; x < width; x += 8) {
      const i = (y * width + x) * channels;
      const key = `${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`;
      if (!seen.has(key)) {
        seen.add(key);
        colors += 1;
      }
      if (!first) first = key;
      if (x >= x0 && x < x1 && y >= y0 && y < y1) {
        const lum = pixels[i] * 0.3 + pixels[i + 1] * 0.59 + pixels[i + 2] * 0.11;
        if (lum > 210) light = true;
        if (lum < 45) dark = true;
      }
    }
  }
  return { colors, light, dark, flat: colors < 2 };
}

describe('Play 上架材料', () => {
  it('隐私政策页是中英双语，并留着邮箱占位', () => {
    const html = fs.readFileSync('public/privacy.html', 'utf8');
    expect(html).toContain('方块跑酷隐私政策');
    expect(html).toContain('Block Runner Privacy Policy');
    expect(html).toContain('AdMob');
    expect(html).toContain('广告 ID');
    expect(html).toContain('Advertising ID');
    expect(html).toContain('UMP');
    expect(html).toContain('本地存储');
    expect(html).toContain('[请替换为你的邮箱]');
    expect(html).toContain('[replace with your email]');
    expect(html).toContain('ca-app-pub-3218611878548189~9810569030');
  });

  it('app-ads.txt 只有发布商那一行', () => {
    const text = fs.readFileSync('public/app-ads.txt', 'utf8').trim();
    expect(text).toBe(APP_ADS);
  });

  it('设置页外链指向 Pages 上的隐私政策', () => {
    expect(PRIVACY_POLICY_URL).toBe('https://howard-hang.github.io/phaser-platformer/privacy.html');
    expect(isAllowedExternalUrl(PRIVACY_POLICY_URL)).toBe(true);
    expect(isAllowedExternalUrl('http://howard-hang.github.io/phaser-platformer/privacy.html')).toBe(false);
    expect(isAllowedExternalUrl('https://example.com/privacy.html')).toBe(false);
    const java = fs.readFileSync('android/app/src/main/java/com/fangkuai/paoku/MainActivity.java', 'utf8');
    expect(java).toContain('howard-hang.github.io');
    expect(java).toContain('FangkuaiLinks');
  });

  it('正式包打开 R8、不可调试，版本名是 1.0.0', () => {
    const gradle = fs.readFileSync('android/app/build.gradle', 'utf8');
    expect(gradle).toContain('debuggable false');
    expect(gradle).toContain('minifyEnabled true');
    expect(gradle).toContain('shrinkResources true');
    expect(gradle).toContain("?: '1.0.0'");
    expect(gradle).toContain('ANDROID_VERSION_CODE');
    expect(gradle).toContain('ANDROID_KEYSTORE_FILE');
    expect(gradle).not.toMatch(/storePassword\s+['"][^'"]+['"]/);
    const proguard = fs.readFileSync('android/app/proguard-rules.pro', 'utf8');
    expect(proguard).toContain('JavascriptInterface');
    expect(proguard).toContain('com.getcapacitor.Plugin');
    expect(proguard).toContain('com.google.android.gms.ads');
    const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
    expect(manifest).toContain('com.google.android.gms.permission.AD_ID');
    expect(manifest).toContain('tools:node="remove"');
    expect(manifest).not.toContain('ACCESS_FINE_LOCATION" />');
  });

  it('CI 在没有密钥时仍检查 release 清单，有密钥才上传 AAB', () => {
    const yml = fs.readFileSync('.github/workflows/android.yml', 'utf8');
    expect(yml).toContain('ANDROID_KEYSTORE_BASE64');
    expect(yml).toContain('ANDROID_KEYSTORE_PASSWORD');
    expect(yml).toContain('ANDROID_KEY_ALIAS');
    expect(yml).toContain('ANDROID_KEY_PASSWORD');
    expect(yml).toContain('bundleRelease');
    expect(yml).toContain('assembleRelease');
    expect(yml).toContain("VITE_ADMOB_USE_TEST_ADS: 'false'");
    expect(yml).toContain('return`false`');
    expect(yml).toContain('targetSdkVersion');
    expect(yml).toContain('application-debuggable');
    expect(yml).toContain('com.google.android.gms.permission.AD_ID');
    expect(yml).toContain("steps.signing.outputs.configured == 'true'");
    expect(yml).toContain('github.run_number');
    expect(yml).toContain('ci-ephemeral');
  });

  it('商店图是 Play 要的尺寸，宣传图和截图没有透明通道，也不是整张纯色', () => {
    expect(pngSize('store/icon-512.png')).toMatchObject({ w: 512, h: 512 });
    const icon = pngVariety('store/icon-512.png');
    expect(icon.flat).toBe(false);
    expect(icon.light && icon.dark).toBe(true);
    const feature = pngSize('store/feature-1024x500.png');
    expect(feature).toMatchObject({ w: 1024, h: 500, colorType: 2 });
    const featurePixels = pngVariety('store/feature-1024x500.png');
    expect(featurePixels.flat).toBe(false);
    expect(featurePixels.colors).toBeGreaterThan(8);
    expect(featurePixels.light && featurePixels.dark).toBe(true);
    for (const name of [
      'phone-01-menu.png',
      'phone-02-select.png',
      'phone-03-playing.png',
      'phone-04-settings.png',
    ]) {
      expect(pngSize(`store/${name}`), name).toMatchObject({ w: 1920, h: 1080, colorType: 2 });
      expect(pngVariety(`store/${name}`).flat, name).toBe(false);
    }
  });
});
