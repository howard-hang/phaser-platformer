/**
 * 上架材料：隐私政策、app-ads.txt、正式包开关和 CI 清单检查。
 * 不连商店，也不读密钥。
 */
import fs from 'node:fs';
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

  it('商店图是 Play 要的尺寸，宣传图和截图没有透明通道', () => {
    expect(pngSize('store/icon-512.png')).toMatchObject({ w: 512, h: 512 });
    const feature = pngSize('store/feature-1024x500.png');
    expect(feature).toMatchObject({ w: 1024, h: 500, colorType: 2 });
    for (const name of [
      'phone-01-menu.png',
      'phone-02-select.png',
      'phone-03-playing.png',
      'phone-04-settings.png',
    ]) {
      expect(pngSize(`store/${name}`), name).toMatchObject({ w: 1920, h: 1080, colorType: 2 });
    }
  });
});
