# 方块跑酷

一个用 Phaser 3 做的自动跑酷网页游戏。方块会一直向右跑，玩家只负责起跳。画面是紫色渐变天空、远山和近景光带，白色方块、地面白线和金色星星，接近 Geometry Dash 的读法，但没有用它的素材。

## 玩法

- 一共 5 关。每关大约 70 到 76 秒，都落在 60 到 90 秒之间。越往后尖刺越密，连跳、跳过方块和窄缝越多，跑速也会略快一点。跳跃高度和重力不变。
- 地面上有尖刺和深色方块，跳过去。悬空的方块要从下面钻过去，跳起来会撞上。
- 碰到任何障碍都会死亡，死亡数加 1，并立刻回到最近的存档点（小旗）。已经捡到的星星和分数不会清掉。
- 每关 3 颗星星。地上的踩过去就行，空中的要在跳跃弧线上碰到。越靠后的一颗位置越刁。
- 分数按本局跑过的最远距离计算，死回去也不会倒扣。
- 跑进终点门后出现通关面板，可以再玩一次、进入下一关，或回到选关。下一关还没解锁时，按钮上写还差几颗星，不能点进去。第 5 关没有下一关。
- 第 1 关默认开放。累计星星达到 2、4、7、10 颗时，依次解锁第 2 到第 5 关。累计数是每一关拿到过的最高星数相加。没通关的这一局不记入，重玩拿到更少的星也不会把记录降下去。进度存在浏览器 localStorage 里，关掉再开还在。
- 右上角的主页按钮回到选关。选关里的「返回标题」回到标题画面。

左上角：

- `SCORE` 青色，距离分
- `DEATHS` 红色，死亡次数
- `STARS` 白色，已捡星星

右上角是主页、全屏和声音开关。声音开关会同时关掉背景音乐和音效，再点一次恢复，选择会记在浏览器里，下次打开仍然有效。网页版才有全屏按钮；安卓安装包本身就是沉浸式全屏，不再叠一颗按钮。

## 操作

- 点击或触摸画面：跳跃
- 空格或上方向键：跳跃
- 只有落在地面上才能跳，空中会转满一圈再落地
- 主页、全屏、声音、再玩一次、下一关、选关、返回标题这几个按钮不会触发跳跃

画面会铺满整个窗口，不留黑边，也不会把方块拉扁。设计分辨率仍是 16:9（960×540）。更宽的屏幕向左右多看一截跑道，更高的屏幕在上方多留天空，地面和碰撞位置不变。手机横屏、平板和桌面窗口都这样处理，旋转或改变窗口大小后 HUD 会重新贴边。

刘海、挖孔和圆角用 `env(safe-area-inset-*)` 让开，计数和按钮不会被挡住。网页版右上角的全屏按钮走 Fullscreen API。安卓包隐藏状态栏和导航栏，从屏幕边缘滑出后系统栏会再藏回去。

背景是三层视差：远景几何山影、中景发光方块和光柱、近景透视地平线和疏密不一的发光线段。近景不再铺等距网格，贴图按一段不重复的顺序拼接，单关里看不出循环。五关的天空和山用不同的紫色（品红、紫罗兰、靛、玫红、夜紫）。层都是事先烤好的贴图，滚动时只挪位置、换已经烤好的序号。跑得越远，背景会略微变亮。

## 本地运行

需要 Node.js 20 或更新版本。

```bash
npm install
npm run dev
```

浏览器打开终端里提示的本地地址（默认 `http://localhost:5173`）。

## 测试

碰撞、计分、存档点、解锁存档，以及“每一关都能无伤跑完并捡完全部星星”都是纯逻辑测试，不需要浏览器：

```bash
npm test
```

## 构建

```bash
npm run build
npm run preview
```

`npm run build` 会在 `dist/` 生成静态文件。`npm run preview` 用来本地打开构建结果。

也可以用任意静态服务器，例如：

```bash
npx serve dist
```

不要直接用 `file://` 打开 `dist/index.html`，模块脚本需要 HTTP。

## 安卓安装包

安卓包用 Capacitor 把上面的 `dist/` 装进沉浸式全屏 WebView，状态栏和导航栏都隐藏。玩法、画面和网页版是同一份构建结果，资源都在 APK 里，断网也能玩。桌面名称是「方块跑酷」，方向锁在横屏，没有浏览器地址栏。切到后台时背景音乐会暂停，回到游戏后从刚才的位置继续，不会从头播放。

返回键：关卡里（包括通关面板）回到选关，选关回到标题，标题退出应用，不会直接闪退。死亡或再玩一次也不会把背景音乐拨回开头。

本地重新打包需要：

- Node.js 20 或更新版本
- JDK 21
- Android SDK，`compileSdk` 36（Capacitor 8）。设置环境变量 `ANDROID_HOME`

```bash
npm install
npm test
npm run android:apk
```

`npm run android:apk` 会先 `npm run build`，再 `npx cap sync android` 把 `dist/` 拷进安卓工程，最后用 Gradle 打调试签名包：

`android/app/build/outputs/apk/debug/app-debug.apk`

手机打开开发者选项和 USB 调试后：

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

只改了网页、想更新已有的安卓工程时，也可以分开跑：

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

图标是紫底白方块，和游戏里的玩家一样。要重新生成各分辨率图标和启动图：

```bash
pip install pillow
python3 scripts/generate-android-icons.py
```

GitHub Actions 工作流 `.github/workflows/android.yml` 会在拉取请求和推送到 `main` 时构建这个调试 APK，并上传为名为 `fangkuai-paoku-debug` 的 artifact。推送到 `main` 后，还会把同一份包发到 GitHub Release `android-debug`（预发布），文件名是 `fangkuai-paoku-debug.apk`。发布步骤不检出仓库，所以要显式带上 `GH_REPO`，否则 `gh` 会因为找不到 git 仓库而失败。这是调试签名，不能上架商店。网页测试和 Pages 部署仍走 `.github/workflows/pages.yml`，没有改那个文件。

## 背景音乐

标题画面和关卡共用一首循环的电子乐，文件在 `src/assets/music/pulse.ogg`（Vorbis，约几百 KB），会打进网页构建和 APK，断网也能播。死亡、再玩一次、回到标题都接着当前进度，不从头开始。浏览器禁止自动播放，所以要等第一次点击、触摸或按键之后才出声。右上角的声音开关同时管这首曲子和跳跃等音效。

这首曲子是本仓库原创合成的，没有使用第三方采样或曲库：

- 曲名：方块脉冲
- 来源：`scripts/render-bgm.py`（140 BPM、16 小节，按采样率对齐，循环点无缝）
- 作者：方块跑酷项目
- 许可证：[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/deed.zh)（贡献到公共领域，可免费商用，无需署名）

重新生成音频：

```bash
python3 scripts/render-bgm.py
ffmpeg -y -i src/assets/music/pulse.wav -c:a libvorbis -q:a 4 \
  -metadata TITLE="方块脉冲" -metadata ARTIST="方块跑酷" \
  -metadata LICENSE="CC0-1.0" \
  src/assets/music/pulse.ogg
rm src/assets/music/pulse.wav
```

## 在线预览

仓库目前是私有的，GitHub Pages 对私有仓库通常不可用，所以工作流只在仓库变为公开后才部署 Pages（`.github/workflows/pages.yml`）。私有状态下请直接使用分支里已经构建好的 `dist/`，按上面的静态服务器方式验收。
