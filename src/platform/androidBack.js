/**
 * 安卓返回键。
 * 关卡进行中（含通关面板）回到主页，主页或其他画面退出应用。
 * 网页版没有这个按键。只有安卓 WebView 壳才会注册，普通浏览器不会加载 Capacitor。
 */

/** 根据当前是否在关卡里，决定返回键的下一步。 */
export function androidBackAction({ gameActive }) {
  return gameActive ? 'menu' : 'exit';
}

/** 只有安卓 WebView 壳才继续加载 Capacitor，网页版不会去拉这段代码。 */
export function isNativeShell() {
  if (typeof window === 'undefined') return false;
  if (window.androidBridge) return true;
  const ua = navigator.userAgent || '';
  return /Android/i.test(ua) && /; wv\)/.test(ua);
}

function maybeAndroidShell() {
  return isNativeShell();
}

/**
 * 注册硬件返回键。重复触发时只处理一次，避免场景还没切走就退出。
 * @param {import('phaser').Game} game
 */
export async function bindAndroidBack(game) {
  if (!maybeAndroidShell()) return;

  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;
    const { App } = await import('@capacitor/app');
    let handling = false;
    await App.addListener('backButton', () => {
      if (handling) return;
      handling = true;
      try {
        const action = androidBackAction({
          gameActive: !!game.scene?.isActive('game'),
        });
        if (action === 'menu') {
          // 必须从关卡场景切走。直接用 SceneManager.start 不会停掉正在跑的关卡，画面会盖住主页。
          const gameScene = game.scene.getScene('game');
          if (gameScene) {
            gameScene.scene.start('menu');
          } else {
            game.scene.start('menu');
          }
          return;
        }
        // 主页上结束 Activity。先放开返回键拦截，避免新系统把 finish 吃掉。
        App.toggleBackButtonHandler({ enabled: false }).catch(() => {});
        App.exitApp();
      } catch {
        // 判断场景失败时直接退出，避免返回键把 WebView 打崩。
        App.exitApp();
      } finally {
        handling = false;
      }
    });
  } catch {
    // 壳层没接上时游戏照常跑，不在启动时报错。
  }
}
