/**
 * 安卓返回键。
 * 闯关进行中（含通关面板）回到选关，无尽模式回到标题，选关回到标题，标题或其他画面退出应用。
 * 网页版没有这个按键。只有安卓 WebView 壳才会注册，普通浏览器不会加载 Capacitor。
 */

/** 根据当前画面决定返回键的下一步。关卡优先于选关，无尽模式直接回标题。 */
export function androidBackAction({ gameActive, selectActive, endless = false }) {
  if (gameActive && endless) return 'menu';
  if (gameActive) return 'select';
  if (selectActive) return 'menu';
  return 'exit';
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
        const gameScene = game.scene.getScene('game');
        const endless = !!(game.scene?.isActive('game') && gameScene?.endless);
        const action = androidBackAction({
          gameActive: !!game.scene?.isActive('game'),
          selectActive: !!game.scene?.isActive('select'),
          endless,
        });
        if (action === 'select') {
          // 必须从关卡场景切走。直接用 SceneManager.start 不会停掉正在跑的关卡。
          if (gameScene) {
            gameScene.scene.start('select');
          } else {
            game.scene.start('select');
          }
          return;
        }
        if (action === 'menu') {
          // 无尽模式没有选关这一层，返回键直接回标题，并停掉正在跑的跑道。
          if (endless && gameScene) {
            gameScene.scene.start('menu');
            return;
          }
          const selectScene = game.scene.getScene('select');
          if (selectScene) {
            selectScene.scene.start('menu');
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
