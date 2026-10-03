# 方块跑酷架构

这份说明用来缩短后续需求的阅读时间。玩法、数值和画面以代码里的常量为准，这里只讲模块边界和数据从哪流到哪。

`src/scenes/GameScene.js` 只负责开一局和把每一帧串起来。障碍、道具、特效、HUD、输入、物理分别在 `src/scenes/game/`。这些方法是从原来的场景类原样搬出去的，挂回同一个原型，调用方式仍是 `this.xxx()`。

## 运行时怎么串

入口是 `src/main.js`。Phaser 场景顺序：

| 场景 | 文件 | 做什么 |
| --- | --- | --- |
| `boot` | `src/scenes/BootScene.js` | 烤贴图，然后进标题。配置不合法时进错误页 |
| `menu` | `src/scenes/MenuScene.js` | 标题。选关、无尽模式、右上角设置 |
| `select` | `src/scenes/SelectScene.js` | 翻页选关，按累计星星解锁 |
| `settings` | `src/scenes/SettingsScene.js` | 音量、震动、特效、帧率、语言、隐私政策、重置进度 |
| `game` | `src/scenes/GameScene.js` | 闯关和无尽。本身不实现障碍和手感 |
| `error` | `src/scenes/ErrorScene.js` | 把关卡 JSON 的错误写成中文，避免白屏 |

一局开始时 `GameScene.create` 按这个顺序接线：

1. 未解锁的闯关直接送回选关。无尽模式不看星数。
2. 铺地面和跑道（闯关或无尽）。
3. 创建玩家刚体和看得见的跑动贴图。
4. 绑定点击、触屏和键盘。
5. 挂上 HUD、道具条、碎裂、灰尘和死亡特效。
6. 注册三条和物理步对齐的钩子：`preupdate` 先还原刚体坐标并刷新机关，`worldstep` 里转圈，`postupdate` 再把方块画到两次物理步之间。

每一帧 `GameScene.update` 只做调度：特效计时、掉出地图、贴天花板、水平速度、道具队列、飞机高度、星星、分数、无尽路段回收、存档点和终点。具体计算在对应模块里。

### 场景模块

| 文件 | 管什么 |
| --- | --- |
| `src/scenes/game/course.js` | 障碍和跑道。地面、尖刺、方块、倒挂、周期门、坠落平台、重力反转、上层路、终点和存档旗。无尽模式的路段装卸也在这里 |
| `src/scenes/game/items.js` | 道具和星星。浮动、拾取、护甲碎裂、飞机落地清场、飞行时额外吃星星 |
| `src/scenes/game/effects.js` | 死亡碎裂后的重生或无尽结算、闯关通关面板、背景色调随进度变亮。安卓死亡时把复活按钮交给 `revive.js` |
| `src/scenes/game/hud.js` | 本局 HUD 数字和安全区重排。按钮和面板的画法在 `src/game/hud.js` |
| `src/scenes/game/input.js` | 点按和空格起跳。右上角按钮区不起跳 |
| `src/scenes/game/physics.js` | 刚体外推、跑动贴图、贴地和贴天花板、反重力、飞机高度。`applyHitbox` 也从这里导出，跑道创建时共用 |
| `src/scenes/game/revive.js` | 死亡结算上的「看视频复活」。看完从死亡点往回退再继续跑 |

当前行数（`wc -l`，含注释。每个文件都不超过 400 行）：

| 文件 | 行数 |
| --- | --- |
| `src/scenes/GameScene.js` | 275 |
| `src/scenes/game/course.js` | 340 |
| `src/scenes/game/physics.js` | 259 |
| `src/scenes/game/effects.js` | 247 |
| `src/scenes/game/items.js` | 155 |
| `src/scenes/game/revive.js` | 139 |
| `src/scenes/game/input.js` | 59 |
| `src/scenes/game/hud.js` | 46 |

## 数据从哪来

### 关卡 JSON

每一关一个文件，`src/levels/level-01.json` 到 `level-20.json`。清单是 `src/levels/manifest.json`，顺序就是关卡顺序，`unlockStars` 是进入该关需要的累计星星。

JSON 由 `src/game/levelSchema.js` 对照 `src/levels/level.schema.json` 检查。通过之后 `src/game/compileLevel.js` 把「第几秒」换成像素坐标。加载入口是 `src/game/level.js` 的 `import.meta.glob`，网页和 APK 都把 JSON 打进包里。

关卡文件字段：

| 字段 | 含义 |
| --- | --- |
| `id` | `level-1` 这种，必须和清单顺序一致 |
| `name` | 选关和关卡标题 |
| `speed` | 这一关的水平速度（像素/秒）。不改变重力和起跳速度 |
| `duration` | 秒数，40 到 90。终点落在这个时刻 |
| `palette` | `src/game/theme.js` 里 `LEVEL_PALETTES` 的 `id` |
| `obstacles[]` | `{ t, type, ... }`。`t` 是从起跑开始的秒数 |
| `stars[]` | 正好 3 颗。`lift` 是离地高度，`dx` 可选 |
| `checkpoints[]` | 存档点的秒数，起点不用写 |
| `powerups[]` | 可选。`type` 是 `double`、`armor`、`plane`，可加 `lift`、`dx` |
| `routes[]` | 可选上层路。`t`、`span`、`h`，奖励 `star` / `safe` / `shortcut`。`step` 是入口台阶，`high` 是第三层 |

障碍 `type`：

| type | 额外字段 | 编译后 |
| --- | --- | --- |
| `spike` | `count` 1 到 6，`anchor` 为 `floor` 或 `ceiling` | 地面是 `spike`，天花板是 `cspike` |
| `block` | 无 | `block` |
| `overhead` | `gap`，默认 58 | `overhead` |
| `crumble` | `span`、`delay` | `x0`、`x1`、`collapse`（到达时刻加 delay） |
| `gate` | `period`、`open`、可选 `phase` | 开合按跑到该 x 的关卡时间算 |
| `flip` | `span` | 同时写入 `level.flips` 和 `obstacles` |

`compileLevel` 返回的运行时关卡是游戏和搜索共用的结构：

```text
{
  id, name, index, speed, palette, paletteId,
  startX, finishX, worldWidth,
  checkpoints,   // 像素，含起点
  obstacles,     // { id, type, x, rise, ... }
  stars,         // { id, x, lift }
  powerups,      // { id, type, x, lift }
  flips,         // { id, x0, x1 }
  decks,         // { id, x0, x1, top, h, layer, kind, fork }
  routes,        // 分叉的逻辑描述，kind 为 route 的平台
  forkCount, maxLayer
}
```

坐标换算：`x = START_X + t * speed`，`START_X` 在 `compileLevel.js`，目前是 240。上层障碍带 `rise`，脚底表面是 `groundY - rise`。

无尽模式不读关卡 JSON。`src/game/segments.js` 从闯关里切出片段，`endlessCourse.js` 按种子往前拼，`endlessCurve.js` 决定越跑越快。拼出来的障碍仍用同一套 `obstacle` 形状，所以判定函数不用分叉。

### 手感、存档和设置

`src/logic/world.js` 的 `TUNING` 是全局手感：重力、起跳速度、地面高度、设计分辨率、计分像素。关卡只覆盖 `speed`。碰撞盒在 `HITBOX`。

进度存在 `localStorage` 键 `fangkuai-paoku-progress`，形状是 `{ best: { "level-1": 0到3 } }`。累计星星是各关最高星之和。无尽纪录键是 `fangkuai-paoku-endless`，形状是 `{ best: 米数 }`。

设置键是 `fangkuai-paoku-settings`：

```text
{
  musicVolume,  // 0 到 1
  sfxVolume,
  vibrate,      // 布尔
  fx,           // "high" | "low" | "off"
  showFps       // true、false，或 null（还没拨过，网址 ?fps 仍有效）
}
```

`fxProfile` 把特效档位收成灰尘速率、残影条数和镜头震动比例。音量和原来的静音开关联动，静音键是 `fangkuai-audio-muted`。

语言不放进上面这个对象。键是 `fangkuai-paoku-locale`，值是 `zh`、`en`、`es`、`ja`、`ko`。没写过这个键时按系统语言选，对不上就用英语。玩家在设置里点过之后才写入，下次打开以玩家的选择为准。

## 界面语言

玩家能看见的字都在 `src/i18n/`。代码里用 `t('键')`，带数字的用 `t('键', { count })`。五种文件的键要一致：

| 文件 | 语言 |
| --- | --- |
| `src/i18n/zh.json` | 中文。游戏名是「方块跑酷」 |
| `src/i18n/en.json` | 英语。没有对应语言时用这份 |
| `src/i18n/es.json` | 西班牙语 |
| `src/i18n/ja.json` | 日语 |
| `src/i18n/ko.json` | 韩语 |

英语、西班牙语、日语、韩语的游戏名都是 Block Runner。入口在 `src/i18n/index.js`：`initLocale` 在 `src/main.js` 里、场景创建之前调用；`setLocale` 立刻改当前语言并写入 localStorage。设置页改完会当场刷新自己的字，其它场景下次进来时读新语言。

关卡 JSON 里的 `name` 仍是中文原文，选关和关卡标题显示的是 `level.1` 到 `level.20`。校验失败时的长错误还是中文诊断，只在配置坏掉时出现；错误页的标题走 `error.title`。

安卓桌面名字跟着系统语言，不看游戏里的选择。默认 `android/app/src/main/res/values/strings.xml` 是 Block Runner。`values-zh` 覆盖 zh 和 zh-CN，名字是「方块跑酷」。`values-zh-rTW` 和 `values-zh-rHK` 是「方塊跑酷」。`values-en`、`values-es`、`values-ja`、`values-ko` 仍是 Block Runner。游戏里遇到繁体系统语言时界面用简体，标题仍显示「方块跑酷」。

日语假名和韩语谚文不在站酷黄油体里。`scripts/subset-font.mjs` 另收一份 `src/assets/game-font-cjk.woff2`（Droid Sans Fallback 子集），`GameFontCJK` 排在标题字后面。缺字再落到系统黑体。

### 加一条文字

1. 五个 JSON 都加上同一个键。占位符写成 `{name}`，五种语言的占位符名字要一样。
2. 调用处写 `t('键')` 或 `t('键', { name })`，不要把中文直接写进场景。
3. 句子比较长时，按钮走 `createCandyButton` 自带的缩小，普通文字用 `shrinkToWidth`，避免 360×640 上被裁切。
4. 跑 `node scripts/subset-font.mjs`，把新字收进字体。日语、韩语、西班牙语重音会进 CJK 兜底。
5. `npm test`。`tests/i18n.test.js` 会核对五种文件的键和占位符。

## 加一种障碍

要改的文件是固定的几处，不用再把 `GameScene.js` 通读一遍。

1. `src/levels/level.schema.json` 和 `src/game/levelSchema.js`：允许新的 `type`，并写上必填字段。
2. `src/game/compileLevel.js`：把秒数展开成 `obstacles` 里的一条记录。
3. `src/logic/world.js` 的 `obstaclePose`：给出贴图 key、中心点和碰撞盒。周期开关也在这里算。
4. `src/game/textures.js`：如果需要新贴图，在这里烤出来。
5. `src/scenes/game/course.js`：闯关创建精灵。特殊机关（会塌、会开关、带额外刚体）在 `createCourse` 里分支，并在 `syncCourse` 里按关卡时间刷新。普通静态障碍走现有的 `obstaclePose` 循环即可。
6. `src/game/endlessActors.js`：无尽路段要能挂上同一种障碍。
7. `src/logic/search.js` 和 `src/logic/audit.js`：搜索和体检要认识它，否则「每一关都能无伤通关」会把新障碍当成空气或死局。
8. 关卡 JSON 里加上若干个，跑 `npm test`。

碰撞仍是玩家和 `hazardSprites` 重叠后进入 `effects.js` 的 `onHazard`。不要为新障碍再写一条死亡规则，除非它和坑一样必须绕过护甲。

## 加一种道具

1. `src/game/powerupConfig.js`：时长、范围。不要在这里改重力、起跳速度或跑速。
2. `src/logic/powerups.js`：状态机。`grantPower`、`tickPower`、`resolveJump`、`resolveHazard` 按 `kind` 分支。
3. `src/levels/level.schema.json`：`powerups[].type` 加上新名字。
4. `src/game/textures.js`：道具贴图，命名沿用 `power-<type>`，`spawnPowerupSprite` 会直接拿这个 key。
5. `src/scenes/game/items.js`：拾取之后如果不能用现有的 `grantPower` 表达，再加分支。浮动和吃掉的列表已经是通用的。
6. `src/game/hud.js` 的道具条：如果需要新图标或倒计时。
7. 无尽投放在 `powerupConfig.js` 的 `endless.types`。闯关每一关放几个由 `campaign.counts` 和 `campaignPowerType` 决定，生成脚本在 `scripts/generate-levels.mjs`。

玩家状态在 `this.power`，时钟是 `this.powerClock`（秒）。物理回调里只把类型推进 `_powerQueue`，真正改状态在 `update` 里的 `flushPowerQueue`，避免刚体遍历到一半被拆掉。

## 逻辑和画面的分界

| 目录 | 规则 |
| --- | --- |
| `src/logic/` | 不引用 Phaser。`world` 管常数和姿态，`kinematics` 管和 Arcade 一致的一步积分，`rules` 管分数、星星、存档点和终点，`powerups` 管道具状态，`search` / `simulate` / `audit` 用来证明关卡能通 |
| `src/game/` | 贴图、主题、视差、HUD、音频、死亡和灰尘特效、关卡编译、无尽拼图、设置、震动、视口。可以引用 Phaser |
| `src/scenes/` | 把上面两部分接到场景生命周期上 |
| `src/platform/androidBack.js` | 返回键：闯关回选关，无尽和选关回标题，标题退出 |
| `src/platform/externalLink.js` | 设置页打开隐私政策。只允许 `howard-hang.github.io` 的 https 链接 |
| `src/platform/admob.config.js` | 激励视频的应用 ID、广告位和测试开关。正式 ID 只写在这里 |
| `src/platform/rewardedAd.js` | 安卓 AdMob：UMP 同意、加载和播放复活激励视频。网页不加载 |
| `src/logic/revive.js` | 复活落点、次数、广告回调和按钮状态。不引用 Phaser |
| `src/logic/adLoad.js` | 同意失败也要请求广告、预加载重试次数和调试地理。不引用 Phaser |

改手感只动 `TUNING` 或某一关的 `speed`。改画法不要改 `logic/` 的判定。

## 激励视频复活

只有安卓壳会播广告。网页不显示复活按钮，死亡流程和原来一样：闯关回存档点，无尽直接结算。

玩家死亡后，结算面板上多一个「看视频复活」。无尽模式加在原来的结算面板上，闯关模式先弹出「倒在这里」，旁边仍有「回到存档点」。看完并拿到奖励后，从死亡位置往回退 `REVIVE_BACK_PX`（180 像素，不超过起跑线），再无敌 `REVIVE_INVULN_MS`（1000 毫秒，用游戏时间，不另起墙钟）。星星、最远距离和分数留在 `this.run` 里。每一局 `reviveBudget.used` 最多加到 1，用完就不再显示按钮。

广告还在同意或加载时，按钮显示「加载中」并且不可点。加载成功后按钮马上变成「看视频复活」。失败重试完、没网或中途关掉：不复活，按钮变成「暂无广告」并且不可点。其它按钮仍能回存档点、再来一次或回主页。播放期间 `holdMusicForAd(true)` 暂停音乐，结束一定恢复。

这一单只有复活激励视频。不接开屏、横幅和插屏。`bootRewardedAds` 在启动时就执行，不等死亡。顺序是 `AdMob.initialize`、`requestConsentInfo`，状态是 `REQUIRED` 且表单可用时 `showConsentForm`。同意接口失败、用户关掉框、或者地区不需要同意（`NOT_REQUIRED`），都会继续 `prepareRewardVideoAd`。不再拿 `canRequestAds` 当开关。

预加载从开局开始，最多 `AD_LOAD_MAX_ATTEMPTS`（4）次，两次之间隔 `AD_LOAD_RETRY_MS`（3 秒）。每一步和 AdMob 的错误码都打 `[admob]` 日志。复活按钮订阅状态，不用再死一次才变可点。

UMP 平时只对欧洲和英国弹框。调试包在 `MainActivity` 里读取广告 ID，写成大写 MD5 放到 `window.__FANGKUAI_AD_TEST_DEVICE__`，请求同意时带 `debugGeography=EEA` 和这个测试设备，用来强制弹出同意框。设置页只在调试包显示一行「广告状态：未初始化 / 同意中 / 加载中 / 已就绪 / 失败(错误码)」，以及「重置广告同意」。正式包没有这两项，也不会带 `debugGeography`。`showDebugAdChrome` 在正式网页构建（`live-rewarded`）上直接为 false，所以这两项不会画出来。

安卓壳用 `isNativeShell`（`androidBridge` 或 WebView 的 UA）判断。就算 Capacitor 把平台判成网页，壳上仍会调用 AdMob，避免按钮出现了却从没初始化。

广告 ID 和开关都在 `src/platform/admob.config.js`：

| 常量 | 用途 |
| --- | --- |
| `ADMOB_APP_ID` | 应用 ID。AndroidManifest 的 `com.google.android.gms.ads.APPLICATION_ID` 必须和它相同 |
| `REWARDED_AD_UNIT_ID` | 正式激励位，名字 `revive_rewarded`，奖励 1 次复活 |
| `TEST_REWARDED_AD_UNIT_ID` | Google 官方激励测试位 |

测试和正式怎么切：

- 默认、`vite` 开发版、以及没设变量的构建，都用测试位，并且 `isTesting: true`。CI 的 `android-apk` 打的是调试包，不会请求正式位。
- 调试 APK 还会在 `MainActivity` 写入 `window.__FANGKUAI_DEBUG_APK__ = true`。即使构建变量关错了，调试包仍走测试广告。
- 正式 release 包要在构建网页时加上 `VITE_ADMOB_USE_TEST_ADS=false`，并且 `debuggable` 为 false。这时才用 `REWARDED_AD_UNIT_ID`，`isTesting` 为 false。开关必须写成 `import.meta.env.VITE_ADMOB_USE_TEST_ADS`，Vite 才会收成字面量。包里的 `BAKED_AD_MODE` 是 `live-rewarded` 或 `test-rewarded`。

```bash
VITE_ADMOB_USE_TEST_ADS=false npm run build
npx cap sync android
cd android && ./gradlew bundleRelease assembleRelease
```

签名、versionCode、隐私政策和商店表单写在 [PLAY_STORE.md](PLAY_STORE.md)。设置页的「隐私政策」走 `openExternal`，安卓上由 `MainActivity` 的 `FangkuaiLinks` 用系统浏览器打开。

截图可以让浏览器带上安卓 WebView 的 UA（含 `Android` 和 `; wv)`），再设置 `window.__FANGKUAI_AD_MOCK__`。不要同时写 `window.androidBridge`，那会让 Capacitor 以为自己在真机上，假回调会被丢掉。真机不吃这个假对象。`outcome` 用 `rewarded`、`dismissed` 或 `error`，`ready: false` 就是暂无广告。

## 测试

分两类。

### 纯逻辑

Node 里直接跑，不打开浏览器，也不依赖墙钟。碰撞、计分、解锁、关卡格式、搜索通关、道具状态、视口数学、设置存档、音频策略、死亡特效参数、字体子集都在这里。

| 文件 | 覆盖 |
| --- | --- |
| `tests/rules.test.js` | 分数、星星、存档点、终点 |
| `tests/collision.test.js` | 碰撞盒和姿态 |
| `tests/powerups.test.js` | 道具状态和飞机位移 |
| `tests/motion.test.js` | 显示外推和跑动形变 |
| `tests/level.test.js` | 每一关都能无伤通关并捡满星 |
| `tests/levelConfig.test.js` | JSON 和清单校验 |
| `tests/density.test.js` | 障碍密度相对基线 |
| `tests/route.test.js` | 上层路 |
| `tests/endless.test.js` | 无尽拼图、变速、纪录 |
| `tests/progress.test.js` | 解锁存档 |
| `tests/settings.test.js` | 设置归一化和特效档位 |
| `tests/viewport.test.js` | 铺满、安全区、设置页布局 |
| `tests/audio.test.js` | 静音、音量、视差色调 |
| `tests/deathFx.test.js` | 碎裂时长、碎片、音效文件 |
| `tests/androidBack.test.js` | 返回键去向 |
| `tests/fontSubset.test.js` | 字体子集含界面用字，日语韩语在兜底字体里 |
| `tests/i18n.test.js` | 五种语言文件对齐，切换后文案变化 |
| `tests/i18n.browser.test.js` | 菜单和设置页跟着语言变，小屏不溢出 |
| `tests/revive.test.js` | 复活落点、一局一次、假广告回调、测试和正式广告位 |
| `tests/playStore.test.js` | 隐私政策、app-ads.txt、R8、CI 的 release 清单检查、商店图尺寸 |

### 浏览器

`tests/winPanel.browser.test.js`、`tests/endlessPanel.browser.test.js`、`tests/settings.browser.test.js`。用 Puppeteer 打开真实页面，点按钮、看灰尘。

断言只用游戏帧（`game.loop.frame`）或游戏内时间（物理步的 `_frameTimeMS`，或场景 `update` 累加的 `delta`）。`page.waitForFunction` 的 `timeout` 只是宽松上限，避免页面没起来时一直挂着。不要用 `setTimeout`、`performance.now()` 或固定的 `requestAnimationFrame` 次数来判断玩法有没有发生。

### 怎么跑

```bash
npm test
npx vitest run tests/rules.test.js
npx vitest run tests/winPanel.browser.test.js
```

浏览器用例需要本机的 Chrome 或 Chromium。`npm test` 会一起跑这两类。

GitHub Actions 里只有 `test-and-pages` 跑测试并发布网页。网页产物里有 `privacy.html` 和 `app-ads.txt`。`android-apk` 安装依赖、构建网页、同步 Capacitor、打调试 APK，再用真实广告位打 release（AAB 和 APK）并检查清单。上传密钥四个 Secrets 都空着时，release 只用一次性密钥做检查，不上传；四个都有才上传 `fangkuai-paoku-release`。推到 `main` 时仍会更新固定的 `android-debug` Release。

## 截图

```bash
npm run shots
```

脚本是 `scripts/shots.mjs`。它拉起 Vite，等对应场景的游戏帧推进之后，把四张图写到仓库里的 `shots/`：

| 文件 | 画面 |
| --- | --- |
| `shots/menu.png` | 主菜单 |
| `shots/select.png` | 关卡选择 |
| `shots/playing.png` | 游戏中（第 1 关已经跑起来） |
| `shots/settings.png` | 设置页 |
| `shots/i18n-menus.png` | 五种语言的主菜单拼在一起（360×640） |
| `shots/i18n-settings.png` | 五种语言的设置页拼在一起（360×640） |
| `shots/settings-portrait.png` | 设置页，360×640，带安全区 |
| `shots/settings-landscape.png` | 设置页，844×390，带安全区 |

`shots/` 是生成物，不提交。经典四张图固定用中文。对比图按 zh、en、es、ja、ko 从左到右排。

同一条命令还会把 Play 商店图写到 `store/`，这些要提交：

| 文件 | 尺寸 |
| --- | --- |
| `store/icon-512.png` | 512×512 图标 |
| `store/feature-1024x500.png` | 1024×500 宣传图。中间是标题、方块和障碍，背景用游戏里的紫色视差。脚本会拒绝整张同色的图 |
| `store/phone-01-menu.png` 到 `phone-04-settings.png` | 1920×1080 手机截图 |
