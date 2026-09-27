# Sunny Coast Racer

原创 3D 浏览器街机竞速游戏：晴空海滨城、漂移集气、双喷/断位喷、氮气、AI 对手与圈速。

> QQ 飞车风格灵感，非官方同人项目；不包含官方地图、车辆、音频或商标素材。

## 在线试玩

- 完整版：<https://derekwalldevin-wen.github.io/sunny-coast-racer/>
- 单文件版：<https://derekwalldevin-wen.github.io/sunny-coast-racer/sunny-coast-racer.html>
- 仓库：<https://github.com/derekwalldevin-wen/sunny-coast-racer>

## 画面与玩法

- **程序化跑车**：侧剖面挤出的低趴超级跑车，车长 4.74 / 车宽 1.78 / 车高 1.15；前分流板、侧裙与侧进气、贯穿尾灯、GT 尾翼、后扩散器导流片、尾甲板百叶、六辐轮毂与刹车盘、双出排气火焰。
- **海岸赛道**：起点门架与跑马灯、随风摆动的路边旗帜、弯道人字警示板、路灯与广告牌、灌木与阔叶树、海滩遮阳伞、帆船、港口吊车、盘旋海鸥、灯塔、远山与远岛、日落方向的太阳光晕。
- **驾驶手感**：三圈计时、检查点、漂移集气（普通 / 双段 / 断位三种喷气）、独立氮气、撞击反馈（冲击环 + 火花 + 屏幕闪光 + 车身发光 + 镜头震动 + 音效）、跳台与隧道。
- **5 位 AI 车手**：车道目标 + 前瞻点 + 横向误差转向 + 曲率限速 + 前车避让 + 靠墙脱困；固定步长 300 秒模拟全部完赛 3 圈。
- **界面**：玻璃遥测 HUD、扫光面板、速度表高温辉光、氮气流光、排名升降闪动、Boost 弹簧提示、小地图轨迹拖尾、主菜单与暂停 / 结算卡片动效；自适应桌面 / 平板 / 手机布局与触控按键。

## 操作

| 按键 | 作用 |
| --- | --- |
| `W A S D` | 驾驶 |
| `Space` | 漂移（按住蓄气，松开释放喷气） |
| `Shift` | 集气 / 漂移释放 |
| `Ctrl` | 氮气 |
| `C` | 切换镜头（追尾 / 车内 / 远景） |
| `P` / `Esc` | 暂停 |
| `R` | 重新开始 |
| `M` | 静音 |

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

## 单文件试玩

运行 `node scripts/build-standalone.mjs` 后，打开：

```text
dist/sunny-coast-racer.html
```

它已经把 Three.js、游戏逻辑和 CSS 全部内联到同一个 HTML 文件中，不需要 `assets/` 目录。也可以运行 `start-local.cmd`，然后访问：

```text
http://127.0.0.1:5190/sunny-coast-racer.html
```

## 技术说明

- Three.js `0.170.0` + Vite `5.4.11`，原生 JavaScript，无重型物理引擎。
- 固定步长（`FIXED_DT`）街机物理，帧率波动时仍保持一致的赛道进度。
- 全部视觉均为程序化生成：`CanvasTexture` 路面磨损、路面标线、云、海浪、沙滩、植被与广告牌贴图，无外部素材。
- 碰撞体为车辆胶囊 + 护栏折线，AI 用赛道最近点采样做横向误差与曲率判断。
- 检测到软件渲染（SwiftShader）或窄屏时自动关闭阴影、降低像素比。

