# 方块跑酷

一个用 Phaser 3 做的自动跑酷网页游戏。方块会一直向右跑，玩家只负责起跳。画面是紫色格子背景、白色方块、地面白线和金色星星，接近 Geometry Dash 的读法，但没有用它的素材。

## 玩法

- 方块以固定速度向右跑，关卡大约 75 秒，落在 60 到 90 秒之间。
- 地面上有尖刺和深色方块，跳过去。悬空的方块要从下面钻过去，跳起来会撞上。
- 碰到任何障碍都会死亡，死亡数加 1，并立刻回到最近的存档点（小旗）。已经捡到的星星和分数不会清掉。
- 星星可以捡。地上的踩过去就行，空中的要在跳跃弧线上碰到。
- 分数按本局跑过的最远距离计算，死回去也不会倒扣。
- 跑进终点门后出现通关面板，可以再玩一次。右上角的主页按钮回到标题画面。

左上角：

- `SCORE` 青色，距离分
- `DEATHS` 红色，死亡次数
- `STARS` 白色，已捡星星

右上角是主页和声音开关。声音开关会同时关掉节奏和音效，再点一次恢复。

## 操作

- 点击或触摸画面：跳跃
- 空格或上方向键：跳跃
- 只有落在地面上才能跳，空中会转满一圈再落地
- 主页、声音、再玩一次这几个按钮不会触发跳跃

竖屏和横屏都按 16:9 整幅缩放，多出来的区域留空，不会拉伸变形。

## 本地运行

需要 Node.js 20 或更新版本。

```bash
npm install
npm run dev
```

浏览器打开终端里提示的本地地址（默认 `http://localhost:5173`）。

## 测试

碰撞、计分、存档点和“这一关能无伤跑完并捡完全部星星”都是纯逻辑测试，不需要浏览器：

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

安卓包用 Capacitor 把上面的 `dist/` 装进全屏 WebView。玩法、画面和网页版是同一份构建结果，资源都在 APK 里，断网也能玩。桌面名称是「方块跑酷」，方向锁在横屏，没有浏览器地址栏。

返回键：关卡里（包括通关面板）回到主页，主页退出应用，不会直接闪退。

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

GitHub Actions 工作流 `.github/workflows/android.yml` 会在拉取请求和推送到 `main` 时构建这个调试 APK，并上传为名为 `fangkuai-paoku-debug` 的 artifact。推送到 `main` 后，还会把同一份包发到 GitHub Release `android-debug`（预发布），文件名是 `fangkuai-paoku-debug.apk`。这是调试签名，不能上架商店。网页测试和 Pages 部署仍走 `.github/workflows/pages.yml`，没有改那个文件。

## 在线预览

仓库目前是私有的，GitHub Pages 对私有仓库通常不可用，所以工作流只在仓库变为公开后才部署 Pages（`.github/workflows/pages.yml`）。私有状态下请直接使用分支里已经构建好的 `dist/`，按上面的静态服务器方式验收。
