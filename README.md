# NonokaChan AI Bot

![license](https://img.shields.io/badge/license-GPL--3.0-blue)
![lang](https://img.shields.io/badge/TypeScript-ESM-3178c6)
![protocol](https://img.shields.io/badge/protocol-OneBot%20v11-lightgrey)
![pm](https://img.shields.io/badge/package%20manager-yarn-2c8ebb)

基于 OneBot v11 协议的 QQ 机器人。核心是一条轻量的**模块调用链**框架，AI 对话、长期记忆、搜图、生图、动态推送等能力都以独立模块 / 定时任务的形式挂载在上面。LLM 推理本身不在这个仓库里，机器人负责编排消息、执行工具调用、维护本地记忆。

## 目录

- [特性](#特性)
- [架构总览](#架构总览)
- [目录结构](#目录结构)
- [核心模块详解](#核心模块详解)
- [服务封装 (`src/service`)](#服务封装-srcservice)
- [定时任务 (`src/tasks`)](#定时任务-srctasks)
- [管理面板](#管理面板)
- [配置](#配置)
- [快速开始](#快速开始)
- [部署](#部署)
- [开发指南：如何新增一个模块](#开发指南如何新增一个模块)
- [代码规范与分层规则](#代码规范与分层规则)
- [提交与 PR 规范](#提交与-pr-规范)
- [License](#license)

## 特性

- 🔗 **模块调用链**：按注册顺序匹配 / 命中 / 短路，新功能只需实现 `match` + `run` 并注册一行
- 🧠 **长期记忆**：SQLite + FTS5 全文检索 + 向量检索（RRF 混合排序），聊天记录自动分段、抽取、巩固、淘汰
- 🛠️ **LLM 工具调用**：记忆检索 / 联网搜索 / AI 生图等
- 👥 **群聊人格**：insta-chat 概率触发、别名 / 提及消解、群人设
- 📡 **多平台推送**：B 站动态、Twitter/X、YouTube 直播定时轮询推送
- 🖥️ **管理面板**：内嵌 HTTP 管理面板，可热改配置、查询 / 编辑记忆，无需重启

## 架构总览

```
   OneBot 实现
        │ 
        │  正向 WebSocket（api 连接 + event 连接）
        ▼
   src/core/nnkWS.
        │  
        │  friend / private / group 
        ▼
   src/core/nnkCore.ts  NonokaCore.flow()
        │  
        │  派生 group:at / group:plain，构造 
   ModuleContext
        │
        ▼
┌───────────────────────────────────────────────┐
│  moduleList（按 src/index.ts 注册顺序遍历）     │
│  好友请求 → 管理员命令 → 群命令 → 搜图 → 图库    │
│  → 涩图 → 复读机 → 私聊 AI → 群聊 AI            │
│  每个模块：match(ctx) 命中判定 → run(ctx, hit)  │
│  run 返回 'continue' 才继续往下传，否则链路终止  │
└───────────────────────────────────────────────┘
        │                              │
        ▼                              ▼
 src/service/*（API 封装）   src/modules/aiReply/memory/*
 LLM 转发 / 生图 / 搜图 / 推送源   SQLite 记忆库（FTS5 + 向量）
```

模块以单例注册（`export default new XxxModule()`），实例在所有消息间共享；命中阶段算出的数据通过 `Hit` 返回值传给 `run`，不要用实例字段保存单条消息的状态。

## 目录结构

```
src/index.ts              启动入口：注册模块 / 定时任务，跑一次记忆导入，启动管理面板，连接 WS
src/core/
  nnkWS.ts                OneBot 正向 WebSocket 客户端（api 连接 + event 连接）
  nnkCore.ts / nnkBot.ts  NonokaCore 抽象类 + 具体 Bot 实现，收到事件后跑 flow()
  nnkModule.ts            模块基类 NonokaModule（match/run）与事件类型定义
  nnkSchedule.ts          定时任务注册（toad-scheduler）
  nnkConfig.ts            读取 config.json，得到 botConfig / wsConfig
  nnkStorage.ts           本地 JSON 存储封装（复读计数、好友白名单等轻量状态）
  admin/                  管理面板：HTTP server + token 鉴权 + config/memory 路由
src/modules/              功能模块，每个模块声明订阅的事件（request/private/group[:at|:plain]）
  aiReply/                AI 回复：group、private、记忆子系统、工具、格式化、发送
  group/                  群命令、复读机、本地图库、YKHR OneDrive 转发
  common/                 搜图、涩图等公共模块
  request/                好友请求处理
  admin/                  管理员私聊命令
src/service/              外部服务封装：LLM 转发、生图、搜图、B站/Twitter/YouTube、TTS、CDN
src/tasks/                定时任务实现：清理、记忆巩固、B站/Twitter/YouTube 推送
src/types/                OneBot 事件、消息、配置类型
src/utils/                零业务依赖的工具函数
scripts/                  独立脚本：记忆巩固、召回评测/探测、日志网页服务
data/                     运行期数据：SQLite 记忆库、聊天备份、图片/表情素材
test/                     手动测试脚本
```

## 核心模块详解

### AI 回复：群聊 / 私聊

- **群聊**（[src/modules/aiReply/group](src/modules/aiReply/group)，事件 `group`）：每条消息先入库（`messageStorage` + `aliasIndex`），再决定是否回复——被 `@` 必回，否则由 `trigger.ts` 的概率状态机决定是否"插话"：基础概率 0.015，被 `@` 后 100s 内提升到 0.12，命中关键词最高再加 0.7，随后按 25s 周期指数衰减，并叠加群人设的 `chanceScale`。同群回复做了 3.5s 防抖（`sessionTimers`）+ 并发锁（`processingLocks`），避免刷屏时连续触发。`generateReply.ts` 负责组装历史 + 记忆上下文 + 系统提示、按场景裁剪可用工具集（记忆工具常驻，生图/搜图按开关和状态启用）、控制工具调用轮数（被 `@` 1 轮，插话 0 轮，防止插话拖慢群里节奏）。`voiceState.ts` 是一个按群维护的 TTS 语音回复开关。
- **私聊**（[src/modules/aiReply/private](src/modules/aiReply/private)，事件 `private`）：无防抖、无触发概率、无工具循环，收到消息即格式化 → 追加历史 → `getLLMReply` → 分段发送，逻辑上是群聊流程的简化版。

### 记忆系统（[src/modules/aiReply/memory](src/modules/aiReply/memory)）

最复杂的子系统，基于 `better-sqlite3`，单文件库 `data/memory/nonoka.db`。

<details>
<summary>数据模型（点击展开）</summary>

| 表 | 用途 |
| --- | --- |
| `chat_line` + `chat_fts`（FTS5） | 原始逐行聊天记录，按 `group_id+date_key+seq` 去重；`chat_fts` 是分词后的全文检索镜像 |
| `memory` + `memory_fts` | 结构化记忆：`scope`/`owner_id`/`kind`（trait / episode / relation / alias）/ `confidence` / `hits` / `pinned`，软删除走 `superseded_by` |
| `topic` | LLM 生成的一句话摘要，覆盖一段 `chat_line` 范围（`line_from`–`line_to`），是语义检索的最小单元 |
| `embedding` | `memory` / `topic` 行对应的向量（Float32Array BLOB） |
| `user_profile` | 用户当前昵称缓存 |
| `meta` | schema 版本、增量导入水位线、词典签名等 |

</details>

**端到端流水线**：

1. **落盘**（[storage/message.ts](src/modules/aiReply/storage/message.ts)）：群聊消息实时追加写入 `data/memory/chat/{groupId}_{yyyymmdd}.txt` 纯文本备份，作为记忆系统唯一的事实来源。
2. **增量导入**（[ingest.ts](src/modules/aiReply/memory/ingest.ts)）：`ingestOnStartup()` 在接消息前先把待处理的备份文件解析进 `chat_line`/`chat_fts`，按 group/day 记水位线，幂等（唯一约束兜底），支持词典签名变化触发的 FTS 全量重建。
3. **分词**（[segment.ts](src/modules/aiReply/memory/segment.ts)）：`@node-rs/jieba` + 群内人名/黑话自定义词典（[userDict.ts](src/modules/aiReply/memory/userDict.ts)，防止专有名词被拆成单字），TF-IDF 提取查询关键词，过滤停用词。
4. **抽取**（[extract.ts](src/modules/aiReply/memory/extract.ts)）：`MemoryExtractor` 按用户攒够 30 条消息后调 LLM 产出 ADD/UPDATE/DELETE 操作，写回 `store`，并把新增/变更的行送入向量化队列。只有 `@` 过 bot 的用户会被跟踪。
5. **存储**（[store.ts](src/modules/aiReply/memory/store.ts)）：`MemoryStore` 单例，`pinned` 记忆不允许被 LLM 改写/删除；非 pinned 超过每用户 12 条上限时按衰减分（`confidence × exp(-天数/30) × log(1+hits)`）淘汰最弱的。
6. **向量化**（[vector.ts](src/modules/aiReply/memory/vector.ts) / [embedQueue.ts](src/modules/aiReply/memory/embedQueue.ts)）：单位化 Float32 向量，`WeakMap` 内存缓存，暴力余弦 Top-K（量级在千级，不需要索引）；`embedQueue` 批量攒 20 条或 15s 触发一次，避免阻塞回复主链路。
7. **检索**（[retrieve.ts](src/modules/aiReply/memory/retrieve.ts)）：FTS5+BM25（字面）与向量余弦（语义，相似度硬阈值 0.40）双路召回，用 **Reciprocal Rank Fusion**（k=60）融合排序；`topic` 命中会展开回其覆盖的原始聊天行。对外两个入口：`recallChat`（聊天记录召回，按天窗口 + 说话人加权）、`recallMemory`（结构化记忆召回，按 `aboutUserIds` 硬过滤，混合检索为空时降级关键词兜底）。
8. **巩固**（[consolidate.ts](src/modules/aiReply/memory/consolidate.ts)，由 [tasks/memoryConsolidate.ts](src/tasks/memoryConsolidate.ts) 每 24h 跑一次）：增量导入 → LLM 生成 `topic`（每次 100 行、3 路并发、失败重试、按天记进度水位线可续跑）→ 补齐缺失向量 → 对所有用户跑一次淘汰。**`topic` 只在这一步产生**。
9. **工具化**（[tools.ts](src/modules/aiReply/memory/tools.ts)）：把 `recall_memory` / `recall_chat` 包装成 LLM 工具定义，模型给的"关于谁/谁说的"自然语言名字经 `aliasIndex.resolve()` 消解成 userId，结果截断，任何异常都不抛出（保证工具调用链不中断）。

> 修改记忆相关 prompt 或检索逻辑后，先用真实语料本地跑 `yarn memory:probe` / `yarn memory:eval` 验证，不要凭感觉改。

### 别名 / 提及消解（[src/modules/aiReply/history](src/modules/aiReply/history)）

- `nameMatch.ts`：核心模糊匹配——归一化文本与别名（去装饰、零宽字符、emoji），取消息文本与别名"核心词"（去掉尾部语气词）的最长公共子串重叠度打分，对拉丁字符子串做边界检查（避免 `azu` 命中 `azusa` 内部）。
- `aliasIndex.ts`：扫描 180 天内 `chat_line` 的历史昵称 + `memory` 表里 `kind=alias` 的人工别名，建 `userId → {aliases, groups}` 索引；`resolve(groupId, text)` 返回按分数排序、限定在该群出现过的候选 userId。
- `mention.ts`：扫描对话最近 5 轮用户发言，解析出的别名如果不是当前回复目标，则为其额外注入最多 2 个人的完整档案，让模型知道"顺带提到的人是谁"。

### 格式化与发送

- [format.ts](src/modules/aiReply/format.ts)：CQ 码 → LLM 可读文本（表情/视频/卡片 JSON 等的翻译）、@ 提及 / bot 别名识别、按尺寸和子类型区分"真实照片"和"表情包"，并构建插话 / 生图状态 / 用户记忆等系统提示消息。
- [replySender.ts](src/modules/aiReply/replySender.ts)：按 `||` 切分回复为多个"气泡"，模拟逐段打字延迟顺序发送。
- [stickerMap.ts](src/modules/aiReply/stickerMap.ts)：把模型输出的 `[表情: 关键词]` 替换成本地表情包 CQ 码，概率丢弃以显得更自然。
- [storage/groupProfile.ts](src/modules/aiReply/storage/groupProfile.ts)：`data/memory/group/{groupId}.json` 保存 `chanceScale`（插话概率倍率）和 `profileText`（群人设文本），mtime/size 变化即失效缓存，管理面板改了立即生效。

### 工具调用：生图 / 搜索

- **生图**（[imageGen/tools.ts](src/modules/aiReply/imageGen/tools.ts)）：`draw_image`/`edit_image` 工具定义。生图耗时 20–130s，走异步非阻塞设计——工具调用立即返回"已经在画了"，后台任务完成后单独推送图片+一句话，并把 `drawing → done/failed/blocked` 状态机结果注入下一轮 prompt（[getDrawNotice](src/modules/aiReply/imageGen/tools.ts)），防止模型产生幻觉。按群维护每日配额 + 冷却时间，并发防抖避免重复请求。
- **搜索**（[search/tools.ts](src/modules/aiReply/search/tools.ts)）：`web_search` 工具定义，转发到 `service/search.ts`（搜索 API 在服务端）。按群每日配额（默认 20 次），摘要截断 140 字，并显式要求模型不要罗列 URL、不要说"我搜索了"。

### 群功能模块（[src/modules/group](src/modules/group)）

- `command.ts`：正则匹配的斜杠命令分发——`/initiative on|off`、`/voice on|off`、`/p <推文>`、`/tts <文本>`。
- `repeater.ts`：经典复读机，按群统计连续相同消息次数，超过随机阈值（2 或 3）延迟复读一次并标记本轮已完成，避免反复触发。
- `localPic/`：关键词图库，`/加图 <关键词>` 把附带/引用的图片存进 `data/picture/{关键词}/`，之后消息精确匹配关键词即随机发一张。

### 公共模块（[src/modules/common](src/modules/common)）

- `hPic.ts`：匹配"来点涩图"类口语，调用涩图 API 按配置返回 SFW/R18 图片，白名单群门控。
- `imageSearch.ts`：识别"搜图"/"来源"关键词（附带或引用图片），提取图片 URL 转给 `service/searchImg`。

### 好友请求 / 管理员命令

- [request/requestFriend.ts](src/modules/request/requestFriend.ts)：`autoAddFriend` 开启或请求者在预批准名单中则自动通过，否则拒绝，通过后通知管理员。
- [admin/index.ts](src/modules/admin/index.ts)：管理员私聊控制台（白名单鉴权），`/help`、`/clean-memory`（清内存会话缓存）、`/task <twitter|bilibili> <on|off>`、`/p <groupId> <推文>`。

## 服务封装 (`src/service`)

| 文件 | 作用 |
| --- | --- |
| `llm/index.ts` | 把消息 / 工具调用循环转发给外部 `nonokaService`，服务端跑模型推理，bot 端无状态地重建对话 |
| `imageGen/index.ts` | 直连 OpenAI 兼容生图接口（绕开代理避免超时），重试仅针对 5xx，正则识别内容审核拒绝，超大图先用 `sharp` 压缩再编辑 |
| `searchImg/*` | 以图搜源：优先 SauceNAO，识别为动画再补查 WhatAnime 拿集数/时间点，ascii2d 目前代码内禁用 |
| `search.ts` | 联网搜索转发给 `nonokaService` |
| `tts/index.ts` | 转发到 `nonokaService` 的 `/v1/audio/speech`，返回 base64 音频 |
| `bilibili/dynamic.ts` | 抓取 B 站动态接口（cookie 鉴权），解析多种动态卡片类型 |
| `twitter/*` | 拉取推文缓存、渲染推文截图、拼装含图片/视频的 QQ 消息 |
| `youtube/live.ts` | 查询 youtube 的直播状态接口 |
| `cdn.ts` | 把被墙的 Twitter/YouTube 媒体域名重写成 `Nonoka CDN`（https://cdn.nonoka.online/） 的反代路径 |

## 定时任务 (`src/tasks`)

基于 `toad-scheduler`，在 [src/index.ts](src/index.ts) 统一注册：

- `bilibili.ts`：每 180s 轮询配置的 UP 主最新动态（错峰 2s 一个避免限流），有更新则推送到映射的群。
- `clean.ts`：每 3 天清空内存中的会话历史缓存（不影响持久化的 SQLite 记忆库）。
- `memoryConsolidate.ts`：每 24h 对所有 `initiativeList` 群跑一次记忆巩固（`preventOverrun` 防重入）。
- `twitter.ts`：10s 一次 tick，按服务端算出的 `nextRunAt` 窗口实际拉取；单用户连续失败则跳过，累计失败一定次数则自动关闭任务并通知管理员。
- `youtube.ts`：每 120s 检查直播状态，每个频道首次检查不推送（避免启动时误报已在直播的场次），按 `videoId` 去重。

## 管理面板

[src/core/admin](src/core/admin) 启动一个独立的裸 `http.Server`（默认 `127.0.0.1:9616`，环境变量 `ADMIN_HOST`/`ADMIN_PORT`/`ADMIN_TOKEN` 可覆盖），无框架、内联 HTML/JS 页面；`?token=` 或 `x-admin-token` 头鉴权，绑定非本地地址时若未显式设置 `ADMIN_TOKEN` 直接拒绝启动。

- `config.ts`：`GET/POST /api/config`，读写 `config.json`（白名单校验），**显式拒绝暴露/修改 `wsConfig`/`nonokaService`/`apiKeys` 等密钥字段**（需手动改文件），写入原子化（先写 `.tmp` 再 rename），保存后热更新到运行中的 `bot.config`。
- `memory.ts`：`/memory` 页面 + `GET /api/memory/users|groups|items`、`POST /api/memory/group|add|update|delete`，编辑/置顶/删除记忆走 `MemoryStore` 以保持 FTS/向量同步（不要绕过它直接改库），改动的文本会重新入队向量化，新别名会实时推入 `aliasIndex`（该用户从未在日志中出现过时需要重启才生效）。

## 配置

复制 `config_demo.json` 为 `config.json`，关键字段：

- `wsConfig`：OneBot 正向 WS 的 host/port
- `botConfig.admin`：管理员 QQ 号列表
- `botConfig.nonokaService`：LLM 转发服务地址与 apiKey
- `botConfig.apiKeys`：saucenao / lolicon / 生图服务的密钥
- `botConfig.aiReply`：AI 回复开关、黑名单、记忆工具调用轮数、生图/搜图限额
- `botConfig.biliDynamicPush` / `tweetPush` / `ytLivePush`：动态/推文/直播推送订阅配置
- `botConfig.hPic` / `repeater` / `ykhrOneDrive`：对应功能模块的开关和白名单

## 快速开始

```bash
yarn install
yarn dev
```

调试模式（打印详细日志）：

```bash
yarn debug
```

## 部署

生产部署用 PM2（见 [ecosystem.config.cjs](ecosystem.config.cjs)），同时拉起 bot 主进程和一个 tail 日志的网页服务（`scripts/log-server.ts`）：

```bash
pm2 start ecosystem.config.cjs
```

其他脚本：

```bash
yarn lint                 # eslint 检查 src/
yarn lint-fix             # 自动修复
yarn memory:consolidate   # 手动触发记忆巩固
yarn memory:probe         # 记忆召回探测
yarn memory:eval          # 记忆召回评测（真实语料，非合成数据）
yarn test                 # 跑 test/ 下的测试脚本
```

## 开发指南：如何新增一个模块

1. **确定事件类型**：`request` / `private` / `group`，群消息还可以精确订阅 `group:at`（被 @）或 `group:plain`（未被 @）。参见 [src/core/nnkModule.ts](src/core/nnkModule.ts) 的 `EventKind`。
2. **在对应目录建文件**，继承 `NonokaModule`：

   ```ts
   import {
     EventKind, FlowResult, ModuleContext, NonokaModule,
   } from '@/core/nnkModule';
   import { GroupMessageData } from '@/types/event';

   class MyModule extends NonokaModule<GroupMessageData> {
     readonly name = 'MyModule';

     readonly events: EventKind[] = ['group:plain'];

     // 只做判断，不产生副作用；命中数据通过返回值传给 run
     match(ctx: ModuleContext<GroupMessageData>) {
       return /触发词/.test(`${ctx.data.message}`);
     }

     // 真正的副作用（发消息、写状态）都放这里
     run(ctx: ModuleContext<GroupMessageData>): FlowResult {
       ctx.reply('收到～');
       return 'stop'; // 或 'continue' 继续传给链上后面的模块
     }
   }

   export default new MyModule();
   ```

3. **在 [src/index.ts](src/index.ts) 的 `nnkbot.loadModules([...])` 里注册**，注意数组顺序即命中优先级——越靠前的模块优先拿到消息，`run` 不返回 `'continue'` 时后面的模块不会再收到这条消息。
4. **需要定时任务**则在 [src/tasks](src/tasks) 下实现并在 `nnkSchedule.loadJob([...])` 注册，参考现有任务的 `preventOverrun`/失败退避写法。
5. **需要新配置字段**：在 [src/types/config.ts](src/types/config.ts) 加类型，`config_demo.json` 补默认值，管理面板要暴露的话在 [src/core/admin/config.ts](src/core/admin/config.ts) 的白名单里加字段（密钥类字段不要加）。
6. **需要外部 API**：封装到 `src/service/`，不要直接在 `modules/` 里发 HTTP 请求（参见下方分层规则）。
7. 提交前跑 `yarn lint`；改动了记忆检索/prompt 相关代码的话，先跑 `yarn memory:probe` / `yarn memory:eval` 用真实语料验证效果，不要只凭观感判断。

## 代码规范与分层规则

ESLint 基于 `airbnb-base` + `airbnb-typescript`，并通过 `import/no-restricted-paths` 强制单向依赖（见 [.eslintrc.json](.eslintrc.json)）：

```
utils  ←  core  ←  service  ←  modules  ←  tasks
```

- `utils` 必须零业务依赖，不能被 `core`/`service`/`modules`/`tasks` 反向依赖到业务逻辑
- `service` 不依赖 `nnkBot` 单例（配置从 `@/core/nnkConfig` 取）、不依赖 `modules`、不依赖 `tasks`
- `modules` 不依赖 `tasks`；公共逻辑请下沉到 `service`
- `core` 不依赖 `tasks`、不依赖 `service`

违反这些规则 `yarn lint` 会直接报错。路径别名 `@/*` 映射到 `src/*`。

## 提交与 PR 规范

提交信息沿用仓库现有历史的约定式写法：

```
<type>[可选 scope]: <简要描述>

例：
feat: 记忆巩固支持按天断点续跑
fix(imageGen): 让模型知道图交了没有，发图时配一句话
```

- `type` 常用 `feat` / `fix`，其余按 [Conventional Commits](https://www.conventionalcommits.org/) 惯例（`refactor`/`docs`/`chore` 等）
- PR 标题与提交信息保持一致的 `type: 描述` 风格；

**PR 自检清单**：

- `yarn lint` 通过（分层依赖规则、命名规范都靠它拦）
- 新增模块已在 `src/index.ts` 正确的位置注册，顺序符合命中优先级预期
- 涉及记忆检索 / 分段 / prompt 的改动，跑过 `yarn memory:probe` 或 `yarn memory:eval`（真实语料，每组建议 ≥30 条），而不是凭感觉改
- 新配置字段已同步：`src/types/config.ts` 类型、`config_demo.json` 默认值，需要面板可编辑的话同步 `src/core/admin/config.ts` 白名单
- 没有把 `config.json`、`config_github.json`、`data/` 下的真实密钥或群聊数据带进 diff
- 注释只写非显然的约束/原因，1–2 行为宜，不写大段设计文档式注释

## License

[GPL-3.0](LICENSE)
