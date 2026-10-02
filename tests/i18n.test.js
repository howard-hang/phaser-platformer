/**
 * 五种语言文件键一致，切换后文案跟着变。不看墙钟。
 */
import { afterEach, describe, expect, it } from 'vitest';
import en from '../src/i18n/en.json';
import es from '../src/i18n/es.json';
import ja from '../src/i18n/ja.json';
import ko from '../src/i18n/ko.json';
import zh from '../src/i18n/zh.json';
import {
  LOCALES,
  LOCALE_STORAGE_KEY,
  detectLocale,
  gameTitle,
  getLocale,
  initLocale,
  setLocale,
  t,
} from '../src/i18n/index.js';

const catalogs = { zh, en, es, ja, ko };

function memoryStorage() {
  const memory = new Map();
  return {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key),
  };
}

function placeholders(text) {
  return [...String(text).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

afterEach(() => {
  initLocale(memoryStorage(), 'en');
});

describe('语言文件', () => {
  it('五种语言的条目一致，没有空字符串', () => {
    const keys = Object.keys(zh).sort();
    expect(keys.length).toBeGreaterThan(20);
    for (const locale of LOCALES) {
      expect(Object.keys(catalogs[locale]).sort(), locale).toEqual(keys);
      for (const key of keys) {
        expect(catalogs[locale][key], `${locale} ${key}`).toEqual(expect.any(String));
        expect(catalogs[locale][key].trim(), `${locale} ${key}`).not.toBe('');
        expect(placeholders(catalogs[locale][key]), `${locale} ${key}`).toEqual(placeholders(zh[key]));
      }
    }
  });

  it('中文游戏名是方块跑酷，其它语言是 Block Runner', () => {
    expect(zh['app.name']).toBe('方块跑酷');
    expect(en['app.name']).toBe('Block Runner');
    expect(es['app.name']).toBe('Block Runner');
    expect(ja['app.name']).toBe('Block Runner');
    expect(ko['app.name']).toBe('Block Runner');
    expect(gameTitle('zh')).toBe('方块跑酷');
    expect(gameTitle('es')).toBe('Block Runner');
  });
});

describe('语言选择', () => {
  it('认系统语言，没有对应的就用英语', () => {
    expect(detectLocale('zh-CN')).toBe('zh');
    expect(detectLocale('zh-Hant')).toBe('zh');
    expect(detectLocale('es-MX')).toBe('es');
    expect(detectLocale('ja-JP')).toBe('ja');
    expect(detectLocale('ko-KR')).toBe('ko');
    expect(detectLocale('en-GB')).toBe('en');
    expect(detectLocale('fr-FR')).toBe('en');
    expect(detectLocale('pt')).toBe('en');
    expect(detectLocale('')).toBe('en');
  });

  it('没存过时跟系统语言走，存过之后以玩家的选择为准', () => {
    const storage = memoryStorage();
    expect(initLocale(storage, 'ja-JP')).toBe('ja');
    expect(storage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
    expect(t('menu.endless')).toBe(ja['menu.endless']);

    expect(initLocale(storage, 'fr')).toBe('en');
    expect(t('settings.title')).toBe(en['settings.title']);

    setLocale('ko', storage);
    expect(getLocale()).toBe('ko');
    expect(storage.getItem(LOCALE_STORAGE_KEY)).toBe('ko');
    expect(t('menu.levels')).toBe(ko['menu.levels']);
    expect(t('select.locked', { count: 3 })).toBe(ko['select.locked'].replace('{count}', '3'));

    expect(initLocale(storage, 'zh-CN')).toBe('ko');
    expect(t('settings.title')).toBe(ko['settings.title']);
  });

  it('切换语言后同一条文案会变成另一种说法', () => {
    const storage = memoryStorage();
    initLocale(storage, 'zh-CN');
    const chinese = t('menu.endless');
    setLocale('es', storage);
    const spanish = t('menu.endless');
    setLocale('en', storage);
    const english = t('menu.endless');
    expect(chinese).toBe('无尽模式');
    expect(spanish).not.toBe(chinese);
    expect(english).not.toBe(chinese);
    expect(english).toBe('Endless');
    expect(spanish).toBe('Infinito');
  });
});
