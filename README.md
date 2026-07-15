# SuperARB

Version: 1.6.3

SuperARB 是一个面向链上清算与套利机会监控的本地化运营控制台。它把市场快照、候选机会、运行状态、在线队列、资产概览和全网收益统计集中在一个本地界面中，帮助用户观察机会、管理运行状态，并在安全边界内完成日常运营。

当前版本支持多语言界面：简体中文、English、日本語、한국어、Русский、ไทย。

## 核心能力

- 市场快照：展示支持市场的候选账户、健康因子、债务、抵押和风险状态。
- 运行控制：选择目标市场，查看当前运行状态和本地执行状态。
- 排行榜：展示在线钱包队列、USDT 余额与全网累计发放收益。
- 资产概览：查看本地钱包资产、服务用量、安全运营时长和运行状态。
- 资讯面板：聚合与市场风险、清算和链上运行相关的信息。
- 查询工具：按链和交易哈希查询交易关系图，辅助分析链上行为。
- 本地设置：在控制台内维护运行参数、端点和展示语言。

## 工作原理

SuperARB 围绕链上借贷协议的清算机制运行。系统会持续扫描支持市场中的借贷仓位，识别抵押率下降、债务风险上升、健康因子接近或低于安全阈值的账户。当账户健康因子 `HF < 1` 时，该仓位通常进入可清算状态。

为了提高机会发现和状态确认的速度，SuperARB 使用高速 RPC 通道读取链上数据，并对候选账户进行快速筛选、排序和复核。清算机会不是单纯依赖静态列表，而是结合实时市场快照、债务规模、抵押资产、健康因子和执行可行性进行综合判断。

在满足清算条件后，执行流程会利用闪电贷获得临时流动性，帮助目标账户偿还部分债务。偿还完成后，借贷协议会按规则释放相应抵押资产，并给予清算奖励。执行端随后归还闪电贷本金和费用，剩余差额即为本次清算机会的收益空间。

这一机制的核心在于速度、准确性和风险控制：

- 速度：通过高性能 RPC 更快发现 `HF < 1` 的账户，减少机会被抢占的概率。
- 准确性：在执行前复核账户状态，避免因数据延迟或市场波动导致无效交易。
- 资本效率：闪电贷让执行过程无需长期占用大额本金。
- 风险控制：只在满足清算规则和执行条件时进入候选流程，降低失败交易和额外成本。

SuperARB 控制台负责把候选机会、市场状态、运行情况、排行榜和收益统计清晰展示出来。市场快照作为独立展示模块存在，不参与登录、队列或收益统计逻辑，避免展示数据影响运行链路。

版本 1.6.3 以新的协议和数据结构为准。旧版本数据和旧客户端行为不作为兼容目标，所有客户端应升级到当前版本后再运行。

## 环境要求

SuperARB 是基于 Node.js 的本地 Web 控制台。运行前需要准备：

- Node.js：建议使用 Node.js 20 LTS 或更新版本。
- npm：随 Node.js 一起安装，用于安装依赖和运行脚本。
- Git：用于从 GitHub 获取代码、更新版本和查看变更。
- GitHub 访问权限：用于拉取 SuperARB 主线代码。
- 现代浏览器：建议使用 Chrome、Edge 或 Safari 的最新稳定版。

检查本机环境：

```bash
node -v
npm -v
git --version
```

如果命令不存在，需要先安装对应工具。macOS 用户可以使用 Homebrew：

```bash
brew install node git
```

如果本机使用 `nvm` 管理 Node.js，可切换到 Node.js 20：

```bash
nvm install 20
nvm use 20
node -v
```

## 从 GitHub 获取代码

首次安装：

```bash
git clone git@github.com:xgame2026-hash/superatblib.git
cd superatblib
```

如果没有配置 SSH，也可以使用 HTTPS 地址：

```bash
git clone https://github.com/xgame2026-hash/superatblib.git
cd superatblib
```

确认当前分支：

```bash
git branch --show-current
```

正式运行建议使用 `main` 主线：

```bash
git checkout main
git pull origin main
```

查看当前代码状态：

```bash
git status
```

查看最近版本记录：

```bash
git log --oneline -5
```

## 安装依赖

进入项目目录后安装依赖：

```bash
npm install
```

如果是全新机器或希望严格按锁定版本安装，可以使用：

```bash
npm ci
```

两者区别：

- `npm install`：适合日常安装和本地开发，会根据 `package.json` 和锁文件安装依赖。
- `npm ci`：适合干净环境和发布前验证，会严格使用 `package-lock.json`，速度更稳定，但会重建 `node_modules`。

依赖安装完成后，可以查看可用脚本：

```bash
npm run
```

脚本列表中应包含：

- `dashboard`
- `dev`
- `start`
- `build`
- `preview`
- `verify:queue`

## 启动控制台

启动本地控制台：

```bash
npm run dashboard
```

也可以使用等效命令：

```bash
npm run dev
npm start
```

默认访问地址：

```text
http://127.0.0.1:4311/
```

如果端口被占用，控制台会自动使用下一个可用本地端口。可以通过下面的命令获取当前实际地址：

```bash
npm run dashboard:url --silent
```

打开排行榜：

```bash
npm run dashboard:leaderboard
```

也可以在控制台地址后使用 `#leaderboard` 或 `#execution` 直接进入排行榜页面。

## 基本流程

1. 启动本地控制台。
2. 使用有效授权登录。
3. 在设置页确认本地运行参数和服务端点。
4. 进入总览页检查资产、服务用量、安全运营和累计收益。
5. 进入最新清算页查看在线队列、排行榜和全网累计发放收益。
6. 进入清算控制面板选择市场并启动或暂停本地运行。

## 配置说明

复制示例配置到本地配置文件，并按自己的运行环境填写：

```bash
cp .env.example .env
```

不要提交 `.env` 或任何机器相关配置。多人使用同一套餐时，以服务端统计的实际用量为准。

如果配置修改后页面没有变化，先停止当前控制台，再重新启动：

```bash
npm run dashboard
```

## 构建与检查

生产构建：

```bash
npm run build
```

队列合约检查：

```bash
npm run verify:queue
```

检查文本格式和空白问题：

```bash
git diff --check
```

发布前建议至少完成：

```bash
npm run build
npm run verify:queue
git diff --check
```

构建完成后，本地预览生产包：

```bash
npm run preview
```

## 更新版本

更新前先确认当前分支和本地改动：

```bash
git branch --show-current
git status
```

如果没有本地改动，可以直接更新：

```bash
git checkout main
git pull origin main
npm install
npm run build
```

如果存在本地改动，不要直接覆盖。先确认改动是否需要保留：

```bash
git diff
```

更新后建议重新启动控制台，并检查页面右上角版本号是否为当前版本。

## 常见故障排除

### `node` 或 `npm` 命令不存在

说明 Node.js 没有安装，或终端没有加载正确环境。处理方式：

```bash
node -v
npm -v
```

如果仍然不可用，重新安装 Node.js，或使用 `nvm` 切换版本：

```bash
nvm install 20
nvm use 20
```

### Node.js 版本过低

如果安装依赖或启动时出现版本不兼容提示，先升级 Node.js：

```bash
node -v
nvm install 20
nvm use 20
npm install
```

升级后重新运行：

```bash
npm run build
```

### `npm install` 失败

先确认网络和 Node.js 版本，再清理本地依赖重新安装：

```bash
rm -rf node_modules
npm install
```

如果锁文件和依赖目录状态异常，可以使用干净安装：

```bash
rm -rf node_modules
npm ci
```

如果依赖下载非常慢，可以切换到稳定网络后重试。不要随意删除 `package-lock.json`，它用于锁定依赖版本。

### `Missing script: "dashboard"`

说明当前目录不是项目根目录，或代码不是最新版本。处理方式：

```bash
pwd
ls
npm run
```

目录中应能看到 `package.json`。如果脚本列表中没有 `dashboard`，更新主线代码：

```bash
git checkout main
git pull origin main
npm install
npm run
```

### 端口被占用

控制台会自动寻找可用端口。查看实际地址：

```bash
npm run dashboard:url --silent
```

如果浏览器打不开默认地址，不要只检查 `4311`，应以终端输出或上面命令返回的地址为准。

### 页面打开但数据为空

按顺序检查：

```bash
npm run dashboard:url --silent
npm run verify:queue
npm run build
```

然后在页面中确认：

- 是否已经登录。
- 排行榜是否显示在线钱包。
- USDT 余额是否刷新。
- 累计发放收益是否显示。
- 市场快照是否可以独立展示。

### 构建失败

先查看第一条真实错误，不要只看最后一行。常见处理方式：

```bash
rm -rf node_modules
npm install
npm run build
```

如果仍失败，记录以下信息用于排查：

```bash
node -v
npm -v
git rev-parse --short HEAD
npm run build
```

### Git 更新失败

先查看状态：

```bash
git status
```

如果提示本地文件有修改，先审查差异：

```bash
git diff
```

确认无误后再决定保留、提交或手动处理。不要在不了解改动的情况下强行覆盖本地文件。

### GitHub 拉取失败

如果使用 SSH 地址失败，检查 SSH 是否配置：

```bash
ssh -T git@github.com
```

如果不使用 SSH，可以切换为 HTTPS：

```bash
git remote -v
git remote set-url origin https://github.com/xgame2026-hash/superatblib.git
git pull origin main
```

## 安全性

SuperARB 的安全设计重点是把展示、授权、队列和统计分离：

- 授权只用于判断用户是否可以进入控制台。
- 市场快照只用于展示，不参与队列注册和运行判定。
- 排行榜只展示在线状态和余额信息，不承载授权逻辑。
- 全网累计收益通过独立接口读取，和排行榜列表解耦。
- 本地配置文件不应提交到代码仓库，也不应出现在截图、日志或公开问题报告中。
- 用户应只从可信来源更新客户端，并确认版本号为当前发布版本。

为了降低误操作风险，建议在每次升级后先检查：

- 控制台版本号是否为 `1.6.3`。
- 登录是否正常。
- 排行榜是否能显示在线钱包。
- USDT 余额是否正常刷新。
- 累计发放收益是否能从远程接口实时读取。
- 市场快照是否独立显示，不受队列或排行榜影响。

## 发布原则

发布前必须先完成审计，确认版本号、页面展示、队列注册、排行榜、余额刷新、累计收益和市场快照均符合当前协议。审计通过后再合并到主线并发布。
