# 方块跑酷上架 Google Play

这份说明给要上传商店的人。玩法代码不在这里。正式包由 `.github/workflows/android.yml` 打出来：调试 APK 照旧，另外再打 `bundleRelease` 的 `.aab`（同时出 release APK）。密钥不进仓库。

## 版本从哪来

| 项 | 值 | 依据 |
| --- | --- | --- |
| `targetSdk` / `compileSdk` | 36 | 2026-08-31 起，新应用和更新必须 target Android 16（API 36）。见 [Play Console：Target API level requirements](https://support.google.com/googleplay/android-developer/answer/11926878) 和 [Android Developers：Meet Google Play's target API level requirement](https://developer.android.com/google/play/requirements/target-sdk) |
| `minSdk` | 24 | `@capacitor-community/admob` 8 要求 Android API 24。Google Mobile Ads SDK 24 起最低是 API 23，见 [Migrate SDK versions](https://developers.google.com/admob/android/migration)。24 两边都满足 |
| 广告 SDK | `play-services-ads` 25.4.0，UMP 4.0.0 | 插件默认这条主版本。写在 `android/gradle.properties` |
| `versionName` | `1.0.0` | 语义化版本。要改时设环境变量 `ANDROID_VERSION_NAME` |
| `versionCode` | `github.run_number` | 每次 `android-apk` 工作流加 1。Play 要求每次上传都比上次大，且不超过 2100000000 |

## 16 KB 页面

[Support 16 KB page sizes](https://developer.android.com/guide/practices/page-sizes)：目标 API 35 及以上、带原生库的应用要在 64 位设备上支持 16 KB 页。没有原生代码的应用默认兼容。

本工程用的是 Android Gradle Plugin 8.13（高于 8.5.1），`jniLibs.useLegacyPackaging = false`，未压缩的 `.so` 按 16 KB 对齐。CI 用 `zipalign -c -P 16` 检查 APK，并用 Python 核对每个 ELF 的 `PT_LOAD` 对齐至少 16384。Google Mobile Ads SDK 25.4 的预编译库需要满足同一要求；如果检查失败，先看是哪一个 `.so`，再升对应依赖，不要把对齐检查关掉。

## 正式包和调试包

| | 调试 APK | release AAB / APK |
| --- | --- | --- |
| 签名 | 调试签名 | 上传密钥。Secrets 没配时 CI 用一次性密钥，只为检查清单，不上传 |
| `debuggable` | true | false |
| 混淆 | 关 | R8 + 资源压缩。`proguard-rules.pro` 保留 Capacitor、JavascriptInterface、AdMob、UMP |
| 广告 | 测试位，`test-rewarded` | `VITE_ADMOB_USE_TEST_ADS=false`，真实位 `revive_rewarded`，`live-rewarded` |
| 设置页 | 有广告状态和「重置广告同意」，调试包强制欧洲同意框 | 没有这些。隐私政策按钮两种包都有 |

## 自己生成上传密钥

在自己的电脑上执行。生成的文件不要提交，不要贴进聊天。

```bash
keytool -genkeypair -v \
  -keystore upload-keystore.jks \
  -storetype PKCS12 \
  -alias upload \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

`keytool` 会问密钥库口令和密钥口令。两个可以相同。别名用上面的 `upload`，或者记下你自己填的别名。

把密钥库做成一行 Base64（macOS 把 `-w 0` 换成不换行的写法，或用 `base64 < upload-keystore.jks | tr -d '\n'`）：

```bash
base64 -w 0 upload-keystore.jks
```

GitHub 仓库 → Settings → Secrets and variables → Actions，新建四个 Secrets：

| Secret | 内容 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | 上面整行 Base64，不要加引号 |
| `ANDROID_KEYSTORE_PASSWORD` | 密钥库口令 |
| `ANDROID_KEY_ALIAS` | `upload`，或你在 keytool 里写的别名 |
| `ANDROID_KEY_PASSWORD` | 密钥口令 |

四个都留空时，CI 仍会打出调试 APK，并用一次性密钥检查 release 清单，工作流不会因此失败，也不会把那个一次性包上传成商店产物。只填了一部分会失败，避免签错钥。

本地打正式包时不要把口令写进文件再提交，用环境变量：

```bash
export ANDROID_KEYSTORE_FILE="$PWD/upload-keystore.jks"
export ANDROID_KEYSTORE_PASSWORD='你的密钥库口令'
export ANDROID_KEY_ALIAS='upload'
export ANDROID_KEY_PASSWORD='你的密钥口令'
export ANDROID_VERSION_CODE=1
export ANDROID_VERSION_NAME=1.0.0
VITE_ADMOB_USE_TEST_ADS=false npm run build
npx cap sync android
cd android && ./gradlew bundleRelease assembleRelease
```

产物：

- `android/app/build/outputs/bundle/release/app-release.aab`：上传 Play 用这个
- `android/app/build/outputs/apk/release/app-release.apk`：装到自己手机上看

Play 要的是 AAB。上传密钥要在 Play Console 的「应用完整性」里登记。第一次上传后，这个密钥不能再换，除非走 Google 的重置流程。请把 `upload-keystore.jks` 和口令另外备份。

## 权限

清单里保留：

- `android.permission.INTERNET`
- `android.permission.ACCESS_NETWORK_STATE`（广告库判断有没有网）
- `com.google.android.gms.permission.AD_ID`（Play 要求使用广告 ID 时自己声明）
- `android.permission.VIBRATE`

定位、电话、存储、相机、录音、安装包等如果被依赖合并进来，清单里用 `tools:node="remove"` 去掉。广告 SDK 还会合并这些，CI 不把它们当成多余权限：

- `ACCESS_ADSERVICES_AD_ID`、`ACCESS_ADSERVICES_ATTRIBUTION`、`ACCESS_ADSERVICES_TOPICS`：Android 13 广告服务
- `WAKE_LOCK`：来自 Google 广告测量库
- `FOREGROUND_SERVICE`：来自广告依赖带进来的 WorkManager。游戏自己不启前台服务
- `com.fangkuai.paoku.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`：AndroidX 给自己的广播接收器用的签名权限

正式包里没有原生 `.so`。16 KB 页的要求只约束带原生库的应用，这种纯 Java/Kotlin 包默认兼容。CI 仍跑 `zipalign -c -P 16`，并在出现 `.so` 时核对 ELF 对齐。

`com.google.android.gms.ads.APPLICATION_ID` 是 `ca-app-pub-3218611878548189~9810569030`，和 `src/platform/admob.config.js` 里的 `ADMOB_APP_ID` 相同。

## 隐私政策

页面在 `public/privacy.html`。推到 `main` 且仓库公开时，GitHub Pages 会把它放到：

https://howard-hang.github.io/phaser-platformer/privacy.html

中文和英文在同一页。写了 AdMob、广告 ID、UMP 同意、本地存档。联系邮箱现在是占位 **`[请替换为你的邮箱]`**。上架前改掉 `public/privacy.html` 里的两处占位（中文和英文），再推一次 `main`，等 Pages 更新后再把这个网址填进 Play Console 的隐私政策。

游戏设置页五种语言都有「隐私政策」。安卓上由 `FangkuaiLinks` 用系统浏览器打开上面的网址。

## app-ads.txt

文件内容只有这一行，在 `public/app-ads.txt`：

```text
google.com, pub-3218611878548189, DIRECT, f08c47fec0942fa0
```

Pages 构建会把它拷进网站。项目页上的地址是：

https://howard-hang.github.io/phaser-platformer/app-ads.txt

**这不够。** AdMob 抓的是 Play Console 里「开发者网站」那个域名的根，不是子路径。`howard-hang.github.io` 的根是 `https://howard-hang.github.io/app-ads.txt`。`/phaser-platformer/app-ads.txt` 在项目子路径上，爬虫不认。

可行做法，二选一：

1. 新建用户站点仓库，仓库名必须是 `howard-hang.github.io`。把上面这一行放在该仓库根目录的 `app-ads.txt`，打开 GitHub Pages。Play Console 的开发者网站填 `https://howard-hang.github.io`。隐私政策可以继续用项目页的 `/phaser-platformer/privacy.html`，它不要求在同一个路径根上。
2. 用你自己的域名。让该域名的根能够直接返回 `app-ads.txt`（用户站、单独的仓库加自定义域名，或任何静态托管都可以）。开发者网站填这个域名，例如 `https://example.com`，那么文件必须在 `https://example.com/app-ads.txt`。不要只放在 `https://example.com/phaser-platformer/app-ads.txt`。

填好后在 AdMob 里检查 app-ads.txt 状态。爬虫可能要几天。

## 商店后台怎么填

下面是建议答案，按现在的应用行为写。你在控制台里看到的句子如果和这里差一两个词，按同一含义选，不要改成「面向儿童」。

### 应用类别和广告

- 应用或游戏：游戏
- 类别：街机（Arcade）
- 标记：含广告。选「是」。没有应用内购买

### 目标受众

- 目标年龄：只选 13 岁及以上（13–15、16–17、18+ 可以都选，或只选 18+）。不要选 5 岁及以下、6–8、9–12
- 是否面向儿童：否
- 是否会吸引儿童：否

这样就不会进入「面向家庭」政策。

### 内容分级问卷

按 IARC 问卷的常见问法：

- 暴力：有轻微的卡通或幻想暴力（方块碰到障碍会碎）。没有血腥、没有写实伤害
- 恐惧、性、脏话、管制药品、赌博、粗俗幽默：都没有
- 用户能否互相交流、看到对方的位置、分享个人信息：不能
- 是否分享精确位置：否
- 是否有数字商品购买：否
- 是否含广告：是
- 用户能否自由浏览网页：不能。隐私政策是系统浏览器打开的固定链接，游戏里没有通用浏览器

预期分级大概是 Everyone / PEGI 3。以问卷提交后的结果为准。

### 数据安全表单

先读 [AdMob 的 Play 数据披露说明](https://support.google.com/admob/answer/10113005)。本应用没有自己的服务器。下面这些是广告 SDK 会处理的，仍然要在表单里申报。

- 应用是否收集或共享用户数据：是
- 传输是否加密：是（Google SDK 走 HTTPS）
- 用户能否要求删除：本地存档可以在设置里重置，也可以清除应用数据。广告 ID 由用户在 Android 系统设置里重置或删除。我们没有账号，也没有服务器上的副本
- 数据是否出售：否

建议申报的类型：

| 类型 | 收集 | 共享 | 用途 | 是否可选 |
| --- | --- | --- | --- | --- |
| 大致位置 | 是 | 与 Google 共享 | 广告 | 启动时 SDK 会初始化，按「必需」填。应用不申请精确位置 |
| 应用活动里的广告互动 | 是 | 与 Google 共享 | 广告 | 必需 |
| 设备或其他标识符（广告 ID） | 是 | 与 Google 共享 | 广告 | 必需 |

不要申报：姓名、邮箱、精确位置、通讯录、照片、音频、文件、财务信息、网页浏览历史、崩溃日志（我们没有另接崩溃收集）。

本地星星和设置只在设备上，不上传。表单如果问「仅在设备上处理、不传出设备」，星星、设置、语言可以不列入「收集」。广告 ID 不能这么填，因为它会到 Google。

### 商店文案

短说明不超过 80 个字符。完整说明可以再改，先用下面的草稿。

**中文短说明**

方块会自己往前跑。点按跳跃，收集星星，看视频复活一次。

**中文完整说明**

方块跑酷是一款横屏跑酷。方块会自动向前，点按、空格或上方向键跳跃。二十关由星星解锁，也可以从标题进入无尽模式。

护甲、二段跳和飞机会出现在跑道上。死亡后可以观看一条激励视频，从倒下的地方复活一次。不看也可以回到存档点或结束本局。

进度、音量和语言都存在这台设备上。设置里可以打开隐私政策。含广告，不是面向儿童的游戏。

**English short**

The block runs ahead. Tap to jump, grab stars, and revive once with a video.

**English full**

Block Runner is a side-on runner. The block moves forward on its own. Tap, Space, or Up to jump. Twenty levels unlock with stars, and Endless is on the title screen.

Shields, double jumps, and planes show up on the course. After a fall you can watch one rewarded video to revive once, or skip it and return to the checkpoint.

Progress, volume, and language stay on this device. Privacy Policy is in Settings. Contains ads. Not directed at children.

### 素材

已放在 `store/`。`npm run shots` 会按当前画面重新生成。

| 文件 | Play 要求 | 现在的文件 |
| --- | --- | --- |
| 高分辨率图标 | 512×512，32 位 PNG | `store/icon-512.png` |
| 宣传图 | 1024×500，JPEG 或 24 位 PNG，不要透明通道 | `store/feature-1024x500.png` |
| 手机截图 | 至少 2 张。每边 320–3840 像素，长边不超过短边的 2 倍。24 位 PNG，不要透明通道 | `store/phone-01-menu.png` 到 `phone-04-settings.png`，1920×1080 |

游戏是横屏，截图也是横屏。平板截图不是必须的。

## 必须你本人做的事

这些不能代做，也不要把账号交给自动化：

1. 注册 Google Play 开发者账号。一次性注册费 25 美元，并完成身份验证。组织账号和个人账号的材料不一样。
2. 用上面的 `keytool` 生成上传密钥，备份好，把四个 Secrets 填进 GitHub。不要把密钥文件提交到仓库。
3. 把 `public/privacy.html` 里的邮箱占位换成你的邮箱，等 Pages 部署完成后，在商店资料里填写隐私政策网址。
4. 按上一节放好域名根目录的 `app-ads.txt`，在 Play Console 填写同一个开发者网站，并在 AdMob 里确认爬虫看到了文件。
5. 在 Play Console 创建应用，上传 CI 里带正式签名的 `.aab`（不是调试 APK，也不是 Secrets 未配置时的一次性包）。
6. 填写数据安全、内容分级、目标受众、广告声明、类别和商店文案，上传 `store/` 里的图标、宣传图和截图。
7. 若是 2023-11-13 之后新建的个人开发者账号：先开封闭测试，至少 12 名测试者连续保持加入 14 天，再申请正式版。内部测试不算。组织账号和更早的个人账号不走这条。见 [新个人账号的测试要求](https://support.google.com/googleplay/android-developer/answer/14151465)。
8. 在 AdMob 里把这款应用和 Play 商店上架信息绑在一起，确认激励广告位 `ca-app-pub-3218611878548189/5871324026` 已经启用。新广告位可能要过审后才有填充。
