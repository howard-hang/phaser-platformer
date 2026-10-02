/**
 * 界面语言。文案在 zh/en/es/ja/ko 五份 JSON 里，键必须一致。
 * 第一次打开按系统语言挑，没有对应语言就用英语。
 * 玩家在设置里改过之后写入 localStorage，下次直接用，不再跟系统走。
 */
import zh from './zh.json';
import en from './en.json';
import es from './es.json';
import ja from './ja.json';
import ko from './ko.json';

export const LOCALES = ['zh', 'en', 'es', 'ja', 'ko'];

/** 语言单独存，不和音量设置混在一个对象里。 */
export const LOCALE_STORAGE_KEY = 'fangkuai-paoku-locale';

const CATALOGS = { zh, en, es, ja, ko };

const HTML_LANG = {
  zh: 'zh-CN',
  en: 'en',
  es: 'es',
  ja: 'ja',
  ko: 'ko',
};

let current = 'en';

function browserStorage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** 把 zh-CN、es-MX 这类标签收成五种语言之一。认不出来就返回 null。 */
export function matchLocale(language) {
  const tag = String(language || '').toLowerCase().replace(/_/g, '-');
  if (tag.startsWith('zh')) return 'zh';
  if (tag.startsWith('es')) return 'es';
  if (tag.startsWith('ja')) return 'ja';
  if (tag.startsWith('ko')) return 'ko';
  if (tag.startsWith('en')) return 'en';
  return null;
}

/** 没有对应语言时用英语。 */
export function detectLocale(language) {
  return matchLocale(language) || 'en';
}

function systemLanguage() {
  if (typeof navigator === 'undefined') return 'en';
  return navigator.language || navigator.languages?.[0] || 'en';
}

export function getLocale() {
  return current;
}

export function catalog(locale = current) {
  return CATALOGS[locale] || CATALOGS.en;
}

/**
 * 取一条文案。缺键时先退回英语，英语也没有就把键本身交回去，方便测试发现漏翻。
 * vars 替换 {name}。同名占位符可以出现多次。
 */
export function t(key, vars) {
  const table = catalog(current);
  let text = table[key];
  if (text == null) text = CATALOGS.en[key];
  if (text == null) text = key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

/** 游戏名。中文用「方块跑酷」，其它语言用 Block Runner。 */
export function gameTitle(locale = current) {
  return locale === 'zh' ? CATALOGS.zh['app.name'] : CATALOGS.en['app.name'];
}

/** 关卡名。语言文件里没有时退回 JSON 里的原文。 */
export function levelName(level) {
  const key = `level.${level?.index}`;
  const translated = t(key);
  if (translated === key) return level?.name || '';
  return translated;
}

/** 同步网页标题和 html lang，方便系统读屏和任务栏。 */
export function applyDocumentLocale(locale = current) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = HTML_LANG[locale] || 'en';
  document.title = gameTitle(locale);
}

/**
 * 玩家手动切换。立刻改当前语言，并记到 localStorage。
 * 写不进去时这一局里仍然生效。
 */
export function setLocale(locale, storage) {
  const next = LOCALES.includes(locale) ? locale : 'en';
  current = next;
  const store = storage === undefined ? browserStorage() : storage;
  try {
    store?.setItem(LOCALE_STORAGE_KEY, next);
  } catch {
    // 隐私模式记不住，这一局照样用新语言。
  }
  applyDocumentLocale(next);
  return next;
}

/**
 * 启动时调用。存过的语言优先，否则看系统语言。
 * language 参数给测试用，不传就读 navigator.language。
 */
export function initLocale(storage, language) {
  const store = storage === undefined ? browserStorage() : storage;
  let saved = null;
  try {
    saved = store?.getItem(LOCALE_STORAGE_KEY);
  } catch {
    saved = null;
  }
  const picked = LOCALES.includes(saved) ? saved : detectLocale(language ?? systemLanguage());
  current = picked;
  applyDocumentLocale(picked);
  return picked;
}
