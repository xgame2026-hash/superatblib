# 登录页流体背景使用说明

本文档说明 SuperARB 登录页背景流体效果的安装、接入、参数配置、调试方法和维护规范。目标是让任何人从 GitHub 下载项目后，能清楚知道这套背景怎么运行、怎么调整、哪些参数不能乱改。

## 一、效果目标

登录页背景使用类似 see-x.io 的弱流体效果：黑色底色、蓝紫色流体、鼠标跟随扰动、缓慢自动流动。它不是静态烟雾图片，不是 CSS 渐变，也不是普通粒子烟雾，而是基于 Three.js / WebGL 的 GPU 流体模拟。

视觉要求：

- 背景必须是全屏流体，不要固定在某个角落。
- 流体是一束一束自然流动，不要像人脸、固定烟花、大面积脏块。
- 鼠标移动时有柔和跟随扰动。
- 没有鼠标操作时也要有轻微自动流动。
- 登录卡片保持半透明和背景模糊，能看到后面的流体。
- 登录卡片内部不要再启用旧 canvas 背景。
- 流金效果只允许出现在卡片边框，不能盖住卡片内容。

## 二、代码位置

当前项目中的相关文件：

| 文件 | 作用 |
| --- | --- |
| `src/components/LiquidEther.vue` | 流体背景组件，Three.js / WebGL 核心实现 |
| `src/App.vue` | 登录页调用 `LiquidEther` 的位置 |
| `src/styles.css` | 登录页全屏背景、卡片透明、边框流金、移动端适配 |
| `package.json` | `three` 和 `@types/three` 依赖 |

当前登录页调用位置在 `src/App.vue`：

```vue
<section v-if="!isAuthenticated" class="login-screen">
  <div class="login-liquid-shell">
    <LiquidEther
      class-name="login-liquid-ether"
      :colors="['#6D28D9', '#8B5CF6', '#A78BFA']"
      :mouse-force="20"
      :cursor-size="100"
      :is-viscous="false"
      :viscous="30"
      :iterations-viscous="32"
      :iterations-poisson="32"
      :dt="0.014"
      :resolution="0.5"
      :BFECC="true"
      :is-bounce="false"
      :auto-demo="true"
      :auto-speed="0.5"
      :auto-intensity="2.2"
      :takeover-duration="0.25"
      :auto-resume-delay="3000"
      :auto-ramp-duration="0.6"
    />
  </div>

  <div class="login-card-stack">
    <main class="login-panel">
      ...
    </main>
  </div>
</section>
```

组件导入：

```ts
import LiquidEther from "./components/LiquidEther.vue";
```

## 三、安装

### 1. 从 GitHub 下载项目

```bash
git clone git@github.com:xgame2026-hash/superatblib.git
cd superatblib
```

如果使用 HTTPS：

```bash
git clone https://github.com/xgame2026-hash/superatblib.git
cd superatblib
```

### 2. 安装依赖

```bash
npm install
```

本背景依赖 Three.js。当前项目已经在 `package.json` 中配置：

```json
{
  "dependencies": {
    "three": "^0.178.0"
  },
  "devDependencies": {
    "@types/three": "^0.184.1"
  }
}
```

如果在其他项目单独复用，需要安装：

```bash
npm install three
npm install -D @types/three
```

### 3. 配置环境变量

从 GitHub 下载后，先复制环境变量模板：

```bash
cp .env.example .env
```

然后按实际情况填写 `.env`。`.env` 里可能包含私钥、Token、授权码、RPC 等敏感信息，不要提交到 GitHub。

### 4. 启动 Dashboard

```bash
npm run dashboard
```

Vite 会自动寻找可用端口。如果默认端口被占用，会自动顺延，例如 `4318`、`4323`。浏览器打开终端里显示的地址：

```text
http://127.0.0.1:端口/
```

## 四、在其他页面或项目中接入

如果要把这套流体背景移植到其他 Vue 3 + Vite 项目，最少需要三步。

### 1. 复制组件

复制文件：

```text
src/components/LiquidEther.vue
```

### 2. 在页面中引入

```ts
import LiquidEther from "./components/LiquidEther.vue";
```

### 3. 放入模板

```vue
<section class="login-screen">
  <div class="login-liquid-shell">
    <LiquidEther
      class-name="login-liquid-ether"
      :colors="['#6D28D9', '#8B5CF6', '#A78BFA']"
      :mouse-force="20"
      :cursor-size="100"
      :dt="0.014"
      :resolution="0.5"
      :BFECC="true"
      :auto-demo="true"
      :auto-speed="0.5"
      :auto-intensity="2.2"
    />
  </div>

  <main class="login-panel">
    ...
  </main>
</section>
```

### 4. 添加基础 CSS

```css
.login-screen {
  position: relative;
  display: grid;
  min-height: 100vh;
  place-items: center;
  overflow: hidden;
  background: #000;
}

.login-liquid-shell {
  position: fixed;
  inset: 0;
  z-index: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.login-liquid-ether {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: #000;
}

.login-panel {
  position: relative;
  z-index: 2;
}
```

完整卡片样式以本项目 `src/styles.css` 为准。

## 五、实现原理

`LiquidEther.vue` 使用 Three.js 创建 WebGL canvas，内部是 GPU 稳定流体模拟，结构接近 Yuki Nishidate / Codrops 的多 pass 流体方案。

核心流程：

1. 平流：让颜色场和速度场按当前速度移动。
2. 外力：鼠标或自动演示向流体注入力。
3. 散度：计算速度场中压缩和膨胀的位置。
4. 泊松压力迭代：求解压力场。
5. 压力梯度修正：让流体更接近不可压缩状态。
6. 输出着色：用蓝紫调色板渲染到登录页背景。

这类效果的关键不是“烟雾贴图”，而是连续流体。不要用普通 CSS、静态图片或简单粒子系统替换，否则很难得到自然的鼠标跟随和流体扩散效果。

## 六、核心参数总表

| 参数 | 当前值 | 推荐范围 | 作用 | 调整影响 |
| --- | --- | --- | --- | --- |
| `colors` | `['#6D28D9', '#8B5CF6', '#A78BFA']` | 深紫到浅紫 | 流体调色板 | 决定整体颜色和亮度 |
| `mouseForce` / `mouse-force` | `20` | `12` - `28` | 鼠标推动力度 | 太高像喷射，太低没反馈 |
| `cursorSize` / `cursor-size` | `100` | `80` - `140` | 鼠标影响半径 | 太大容易成片，太小不明显 |
| `isViscous` / `is-viscous` | `false` | `false` | 是否启用粘性 | 开启后更像油漆，不建议 |
| `viscous` | `30` | `20` - `40` | 粘性强度 | 仅 `isViscous=true` 时有效 |
| `iterationsViscous` / `iterations-viscous` | `32` | `16` - `40` | 粘性迭代 | 仅粘性开启时明显 |
| `iterationsPoisson` / `iterations-poisson` | `32` | `20` - `48` | 压力迭代 | 越高越稳定，越耗 GPU |
| `dt` | `0.014` | `0.010` - `0.018` | 时间步长 | 太大容易跳动，太小偏慢 |
| `BFECC` | `true` | `true` | 平流修正 | 开启后更清晰、更稳 |
| `resolution` | `0.5` | `0.35` - `0.75` | 模拟分辨率倍率 | 越高越细腻，越耗性能 |
| `isBounce` / `is-bounce` | `false` | `false` | 边界反弹 | 开启会显得不自然 |
| `autoDemo` / `auto-demo` | `true` | `true` | 无鼠标时自动流动 | 登录页需要开启 |
| `autoSpeed` / `auto-speed` | `0.5` | `0.35` - `0.65` | 自动流动速度 | 太高会躁，太低像静态 |
| `autoIntensity` / `auto-intensity` | `2.2` | `1.6` - `2.6` | 自动扰动强度 | 太高会像烟花或大块 |
| `takeoverDuration` / `takeover-duration` | `0.25` | `0.15` - `0.4` | 鼠标接管过渡 | 越高越柔和 |
| `autoResumeDelay` / `auto-resume-delay` | `3000` | `2500` - `4000` | 鼠标停止后恢复自动流动的延迟 | 太短会抢鼠标 |
| `autoRampDuration` / `auto-ramp-duration` | `0.6` | `0.4` - `1.0` | 自动恢复淡入时间 | 越高越柔和 |
| `className` / `class-name` | `login-liquid-ether` | 自定义类名 | 外层 class | 用于控制尺寸和层级 |
| `style` | `{}` | CSS 对象 | 内联样式 | 一般不用 |

## 七、当前推荐参数

这是当前项目最稳定的一组参数，优先保持不变：

```vue
<LiquidEther
  class-name="login-liquid-ether"
  :colors="['#6D28D9', '#8B5CF6', '#A78BFA']"
  :mouse-force="20"
  :cursor-size="100"
  :is-viscous="false"
  :viscous="30"
  :iterations-viscous="32"
  :iterations-poisson="32"
  :dt="0.014"
  :resolution="0.5"
  :BFECC="true"
  :is-bounce="false"
  :auto-demo="true"
  :auto-speed="0.5"
  :auto-intensity="2.2"
  :takeover-duration="0.25"
  :auto-resume-delay="3000"
  :auto-ramp-duration="0.6"
/>
```

## 八、调参配方

### 1. 更接近自然弱流体

适合登录页默认状态，背景自然、不抢内容：

```vue
:mouse-force="18"
:cursor-size="100"
:auto-speed="0.45"
:auto-intensity="1.9"
:dt="0.014"
:resolution="0.5"
```

### 2. 更亮一点

只调整颜色，不要加黄色、绿色、白色：

```vue
:colors="['#5B21B6', '#7C3AED', '#C4B5FD']"
```

### 3. 更安静一点

适合担心背景影响登录卡片可读性：

```vue
:mouse-force="14"
:cursor-size="90"
:auto-speed="0.38"
:auto-intensity="1.5"
```

### 4. 鼠标反馈更强

适合展示页面，不建议作为默认登录页长期使用：

```vue
:mouse-force="24"
:cursor-size="120"
:auto-intensity="2.3"
```

### 5. 低配机器或移动端

优先降分辨率和迭代，不要先改颜色：

```vue
:resolution="0.35"
:iterations-poisson="24"
:iterations-viscous="20"
```

## 九、样式配置说明

### 1. 背景层

```css
.login-liquid-shell {
  position: fixed;
  inset: 0;
  z-index: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.login-liquid-ether {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: #000;
  opacity: 1;
}
```

注意：

- 必须 `fixed + inset: 0`，否则背景容易只出现在局部。
- 背景必须是黑色底，蓝紫流体才干净。
- 不要把 canvas 放进登录卡片内部。

### 2. 卡片层

```css
.login-card-stack {
  position: relative;
  z-index: 2;
}

.login-panel {
  position: relative;
  overflow: hidden;
  border-radius: 20px;
  background: transparent;
  backdrop-filter: blur(22px) saturate(124%);
}
```

注意：

- 卡片需要高于背景层。
- 卡片背景不能太实，否则看不到后面的流体。
- 卡片也不能完全透明，否则输入框和文字可读性会下降。

### 3. 流金边框

当前卡片边框使用 `conic-gradient` 和 mask 实现。原则是：

- `::before` 负责旋转流金边框。
- `::after` 负责盖住卡片内部。
- 金色只能留在边框上，不能扫进内容区。

维护时重点检查：

- Logo、输入框、按钮上不能被金色光束盖住。
- 边框要有循环滚动效果。
- 圆角和卡片一致，当前为 `20px`。

## 十、启动与验证

### 1. 启动

```bash
npm run dashboard
```

### 2. 打开地址

终端会显示实际端口，例如：

```text
Local: http://127.0.0.1:4323/
```

如果端口被占用，Vite 会自动顺延。端口变化不影响业务，只影响浏览器访问地址。

### 3. 登录页检查项

- 背景是否全屏。
- 背景是否黑底蓝紫流体。
- 背景是否自然缓慢流动。
- 鼠标移动是否能推动流体。
- 鼠标停止后是否能恢复自动流动。
- 登录卡片是否能透出流体。
- 流金是否只在边框。
- 按钮高度是否与输入框一致。
- 版权信息是否在卡片下方，而不是输入框和按钮之间。

### 4. 构建检查

```bash
npm run build
```

构建通过后，再发布到 GitHub。

## 十一、常见问题

### 1. 背景没有显示

检查：

- `LiquidEther` 是否仍在登录页模板中。
- `LiquidEther` 是否正确 import。
- `.login-liquid-shell` 是否被隐藏。
- 浏览器是否支持 WebGL。
- 浏览器是否禁用了硬件加速。

### 2. 背景像固定大块，不像流体

优先降低：

```vue
:auto-intensity="1.6"
:cursor-size="90"
```

并保持：

```vue
:dt="0.014"
:BFECC="true"
```

### 3. 像从角落发射烟花

通常是自动扰动或鼠标力度过强。优先调整：

```vue
:mouse-force="14"
:auto-intensity="1.5"
:auto-speed="0.4"
```

同时检查背景容器是否全屏，不要让 canvas 被局部容器裁剪。

### 4. 颜色脏、发灰、偏黄

不要混入大面积黄色、绿色、白色。推荐保持蓝紫色：

```vue
:colors="['#5B21B6', '#7C3AED', '#A78BFA']"
```

### 5. 页面卡顿

优先降低：

```vue
:resolution="0.35"
:iterations-poisson="24"
```

不要先关闭 `BFECC`，否则视觉稳定性会下降。

### 6. 登录卡片看不到背景

检查卡片背景是否太实。卡片应使用半透明背景和 `backdrop-filter`。不要把 `.login-panel` 改成纯黑实底。

### 7. 流金盖住了卡片内部

检查 `.login-panel::after` 是否存在，且它的层级在边框光效上方、内容下方。流金只能通过 mask 留在边框区域。

## 十二、性能建议

桌面默认：

```vue
:resolution="0.5"
:iterations-poisson="32"
```

低配桌面或移动端：

```vue
:resolution="0.35"
:iterations-poisson="24"
```

高性能展示机器：

```vue
:resolution="0.65"
:iterations-poisson="40"
```

不建议长期使用 `resolution > 0.75`，因为登录页是常驻入口，稳定性优先于极限细节。

## 十三、维护原则

- 不要把这套效果改回 CSS 渐变、图片背景或普通粒子。
- 不要让流体 canvas 进入登录卡片内部。
- 不要使用过亮的黄、绿、白作为主色。
- 不要把自动流动做得太强，登录页重点是授权码输入。
- 不要把端口写死在流体代码或登录页代码中。
- 发布前至少检查桌面宽屏、普通笔记本宽度和移动端宽度。

## 十四、当前基线

当前基线参数：

```ts
{
  colors: ['#6D28D9', '#8B5CF6', '#A78BFA'],
  mouseForce: 20,
  cursorSize: 100,
  isViscous: false,
  viscous: 30,
  iterationsViscous: 32,
  iterationsPoisson: 32,
  dt: 0.014,
  BFECC: true,
  resolution: 0.5,
  isBounce: false,
  autoDemo: true,
  autoSpeed: 0.5,
  autoIntensity: 2.2,
  takeoverDuration: 0.25,
  autoResumeDelay: 3000,
  autoRampDuration: 0.6
}
```

这是当前登录页已经验证过的稳定版本。后续调整建议先复制一份参数，再小步修改，每次只改 1 到 2 个参数，避免无法判断是哪一个参数造成视觉问题。
