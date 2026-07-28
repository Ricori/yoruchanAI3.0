# 记忆系统架构重做 —— 实施交接文档

---

## 一、为什么改

现在的记忆链路由三块拼成:`src/modules/aiReply/storage/userMemory.ts`(每人 ≤6 条 trait 档案)、`src/modules/aiReply/history/search.ts`(备份日志子串检索)、`src/modules/aiReply/history/keywords.ts`(靠虚词硬切词)。

实际表现是「涉及相关话题时搜不到,只能按关键词查」。根因四层:

1. **检索是字面子串**。`search.ts:74` 用 `text.toLowerCase().includes(k)`,没有任何语义。"拉面"召不回"一兰","显卡"召不回"4090"。
2. **关键词排序维度是反的**。`keywords.ts:64` 按长度降序取前 3。但片段越长,在历史日志里逐字出现的概率越低;真正可召回的短词反而被挤掉。正确的维度是稀有度(IDF),长度只是它的劣质代理。
3. **排序里根本没有相关性**。`search.ts:97-107` 双层循环都是 `hits.length < limit` 提前 break,从最近一天倒扫、凑满 5 条就停 —— 拿到的永远是「最近 5 条」而不是「最相关 5 条」。20 天前的完美匹配输给昨天勉强沾边的。叠加只查最后一个说话人(`generateReply.ts:46`)、userId 与 keyword 取 AND(`search.ts:71,74`)、14 天窗口、每群 10 分钟冷却,召回口子极窄。
4. **记忆结构本身在丢信息**。`userMemory.ts:169` 每 30 句整体重生成并硬截断到 6 条,长期事实("在读研究生")和短期热点("最近在打黑神话")抢同样的格子,挤掉就再也回不来。trait 是裸字符串,无时间、无来源、无置信度,分不清「说过一次」和「天天挂嘴边」,也无法过期或消解矛盾。

更根本的是整条链路是 **push(预注入)**:检索全部由启发式在调 LLM 之前决定完,模型没有机会自己去查。而模型恰恰是最好的查询生成器 —— 同义扩展、指代消解、意图推断都是免费的。

**目标形态**:结构化记忆库 + 混合检索(BM25 + 向量,RRF 融合)+ 模型可调工具主动召回 + 离线巩固。

---

## 二、已确认的前提(不要再问用户)

| 项 | 决定 |
|---|---|
| 远端 nonoka 服务 | 可以随意加接口(embedding、结构化抽取、tool_use 协议) |
| 新依赖 | 可以加 native:`better-sqlite3`(FTS5)+ `@node-rs/jieba`(中文分词) |
| 延迟预算 | +1~2s,允许一轮工具往返 |
| 私聊 | 不接入,本次范围限定群聊 |
| 记忆抽取范围 | 只对 `initiativeList` 的群 |
| 旧数据 | **开发期,原 `data/memory/user/*.json` 迁移后可直接删除**,不需要保留回滚 |
| 全量迁移 | **可以阻塞启动**,先跑完再启动,不必强行做成离线脚本 |

### 一处需要注意的范围拆分

「记忆抽取只对 initiativeList」是用户的决定,理由是「行为和现在一致」。但今天 `searchGroupHistory` 对**所有**有备份文件的群都生效。为了不造成功能倒退,按以下拆分:

- **字面索引**(`chat_line` + FTS5):**所有群**。纯本地、零 API 成本,等价于今天的旧账检索。
- **记忆抽取 + 向量化**(要花 LLM/embedding 调用):**只对 `initiativeList`**。与今天一致。

做成配置项 `aiReply.memory.extractGroups`,默认取 `initiativeList`。

---

## 三、现状盘点:保留 / 替换 / 删除

| 文件 | 处置 |
|---|---|
| `history/nameMatch.ts` | **完全保留**,一行不动。认人的打分逻辑调得很好 |
| `history/mention.ts` | **完全保留** |
| `history/aliasIndex.ts` | **保留全部匹配逻辑**,只把 `build()` 的「扫 180 天文件」换成「查 `chat_line` 表」 |
| `storage/groupProfile.ts` | 不动 |
| `storage/message.ts` | **不动**。备份 txt 继续照常写 |
| `group/trigger.ts` `voiceState.ts` `replySender.ts` | 不动 |
| `history/keywords.ts` | 废弃,但 **`stripSpeakerPrefix()` 必须搬走保留** —— `aliasIndex.ts:7` 依赖它 |
| `history/search.ts` | 替换为 `memory/retrieve.ts` |
| `storage/userMemory.ts` | 替换为 `memory/store.ts` + `memory/extract.ts` |
| `group/generateReply.ts` | 改造:删掉 `getHistoryHits`,加工具循环 |

**关键约束:SQLite 是派生索引,不是唯一真相。** `data/memory/chat/*.txt` 继续照常写,SQLite 随时可从备份文件全量重建。数据库损坏不丢数据。

---

## 四、目标架构

```
                  ┌── push(常驻,便宜) ──> 群友档案行 ──┐
群消息 ──防抖──>  │                                      ├──> LLM ──> 回复
                  └── pull(按需,模型决定) ──> tools ─────┘
                                                │
                        ┌───────────────────────┴────────────────┐
                        │  recall_memory(query, about?)          │
                        │  recall_chat(query, speaker?, days?)   │
                        └───────────────────────┬────────────────┘
                                                │
                            hybrid: FTS5 BM25 ∪ 向量余弦 --RRF--> top K
                                                │
                        ┌───────────────────────┴────────────────┐
                        │  SQLite: memory / chat_line / topic    │
                        └───────────────────────┬────────────────┘
                                                │
        在线写入(每 30 句): extract → 与已有记忆调和 → ADD/UPDATE/DELETE ops
        离线巩固(每日):    ingest 昨日日志 → 话题切分+向量化 → 合并/衰减/淘汰
```

### 四个核心决策及理由

**1. 中文检索用 jieba 分词 + FTS5,不自己写 BM25。**
存一列 `seg`(分词后空格分隔)进 FTS5,`unicode61` tokenizer,BM25 由 SQLite 的 `bm25()` 原生提供。
— 不用 `trigram`:需 3 字才命中,"拉面"这类 2 字词召不回。
— 不用 `unicode61` 直接索引原文:它不切 CJK,整段中文会变成一个 token。

**2. 向量化的是「话题片段」不是每条消息。**
每日巩固时把日志按时间间隔切块并概括成 `topic`,向量数量是 O(千) 而非 O(百万)。几千条 Float32Array 暴力余弦是微秒级,不需要向量索引库。

**3. 工具参数用名字而不是 QQ 号。**
模型不知道 userId 但知道昵称。`recall_memory(about: "泽叶")` 由现有的 `aliasIndex.resolve()` 解析成 userId —— 直接复用已经调得很好的认人逻辑,这是本次改造最划算的复用点。

**4. pinned 记忆双重保护。**
`relations`/`aliases` 迁移后 `pinned=1`,LLM 返回的 UPDATE/DELETE op 在**客户端**被强制忽略,不依赖服务端 prompt 自觉。DELETE 一律软删(写 `superseded_by`),不物理删除。

---

## 五、数据库 schema

单文件 `data/memory/nonoka.db`,WAL 模式,启动时按 `meta.schema_version` 迁移。

```sql
PRAGMA journal_mode = WAL;

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
-- schema_version, ingest 水位(每群每日已入库的最大 seq)

-- ========== 字面检索层 ==========
CREATE TABLE chat_line (
  id       INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL,
  user_id  INTEGER NOT NULL,
  date_key INTEGER NOT NULL,        -- yyyymmdd
  seq      INTEGER NOT NULL,        -- 文件内行号,保证同日顺序 + 幂等
  nick     TEXT,
  text     TEXT NOT NULL,           -- 已剥掉 [userId] 外壳的原文
  UNIQUE(group_id, date_key, seq)
);
CREATE INDEX idx_chat_group_date ON chat_line(group_id, date_key);
CREATE INDEX idx_chat_user       ON chat_line(group_id, user_id, date_key);

CREATE VIRTUAL TABLE chat_fts USING fts5(seg, tokenize='unicode61');
-- 普通表(非 external content),索引的是分词后的 seg 而非原文
-- rowid 手工对齐 chat_line.id
-- 删除走普通 DELETE FROM chat_fts WHERE rowid = ?
-- （特殊的 'delete' 命令只对 contentless / external content 表有效，普通表上报 SQL logic error）
-- 注意 bm25() 返回负值,取相反数

-- ========== 语义记忆层 ==========
CREATE TABLE memory (
  id            INTEGER PRIMARY KEY,
  scope         TEXT    NOT NULL,   -- 'user' | 'group'
  owner_id      INTEGER NOT NULL,   -- userId / groupId
  group_id      INTEGER,            -- 来源群,NULL 表示跨群/人工
  kind          TEXT    NOT NULL,   -- 'trait' | 'episode' | 'relation' | 'alias'
  text          TEXT    NOT NULL,
  first_seen    INTEGER NOT NULL,
  last_seen     INTEGER NOT NULL,
  hits          INTEGER NOT NULL DEFAULT 1,   -- 被重复印证的次数
  confidence    REAL    NOT NULL DEFAULT 0.6,
  pinned        INTEGER NOT NULL DEFAULT 0,   -- 人工钉住,永不淘汰/覆盖
  superseded_by INTEGER REFERENCES memory(id),-- 非 NULL 即失效;软删用 -1
  source        TEXT,                         -- 溯源:'MM-DD 原话片段'
  updated_at    INTEGER NOT NULL
);
CREATE INDEX idx_mem_owner ON memory(scope, owner_id) WHERE superseded_by IS NULL;

CREATE VIRTUAL TABLE memory_fts USING fts5(seg, tokenize='unicode61');

-- ========== 话题层(向量检索主载体) ==========
CREATE TABLE topic (
  id        INTEGER PRIMARY KEY,
  group_id  INTEGER NOT NULL,
  date_key  INTEGER NOT NULL,
  summary   TEXT    NOT NULL,       -- 一句话概括
  user_ids  TEXT    NOT NULL,       -- JSON 数组,参与者
  line_from INTEGER NOT NULL,       -- chat_line.id 区间,用于回溯原文
  line_to   INTEGER NOT NULL
);

CREATE TABLE embedding (
  ref_kind TEXT    NOT NULL,        -- 'memory' | 'topic'
  ref_id   INTEGER NOT NULL,
  vec      BLOB    NOT NULL,        -- Float32Array
  PRIMARY KEY (ref_kind, ref_id)
);
```

---

## 六、实施阶段

每阶段结束都应可独立验证。建议按顺序做,P1 之后随时可以停下来跑测试。

### P0 — 依赖与数据层

- `yarn add better-sqlite3 @node-rs/jieba` + `@types/better-sqlite3`
- 新建 `src/modules/aiReply/memory/db.ts`:连接、PRAGMA、schema 迁移(按 `meta.schema_version` 递增执行)
- **验收**:启动后 `data/memory/nonoka.db` 生成,表结构完整

### P1 — 分词与入库

- `memory/segment.ts`:包 `@node-rs/jieba`。导出 `segment(text)`(分词,空格连接)、`queryTerms(text)`(jieba `extract()` 的 TF-IDF 抽取 + 停用词过滤)
- **把 `stripSpeakerPrefix()` 从 `history/keywords.ts` 搬到 `memory/segment.ts`**,更新 `aliasIndex.ts:7` 的 import。`keywords.ts` 其余部分(`STOP_CHARS`/`USELESS_WORDS`/`extractKeywords`)整个删掉
- `memory/ingest.ts`:扫 `data/memory/chat/*.txt`,按 `^\[(\d+)\](.*)$` 解析,剥掉 bot 自己的触发标记(`[主动 0.12]` / `[旧账 2]` / `[点名 1]`,见 `storage/message.ts:23-31`),写 `chat_line` + `chat_fts`。`UNIQUE(group_id, date_key, seq)` 保证重复跑不写重;水位记 `meta`,增量只处理新增行
- **全量 ingest 可以阻塞启动**,跑完再进主流程
- **验收**:`chat_line` 行数与备份文件总行数一致;`chat_fts` 能 MATCH 到中文词

### P2 — 混合检索

- `memory/vector.ts`:embedding 存取(Float32Array ↔ BLOB)+ 暴力余弦 top-K
- `memory/retrieve.ts`:

```ts
recallMemory(groupId, { query, aboutUserIds?, limit })
recallChat  (groupId, { query, speakerIds?, days?, limit })
```

两路召回 + RRF 融合(`score = Σ 1/(60 + rank)`,不需要调权重):
  - 字面:jieba 分词 → FTS5 MATCH → `bm25()` 排序 → top 30
  - 语义:`/llm/embed` 向量化 query → 与 `embedding` 表余弦 → top 30(topic 命中展开成 `chat_line` 区间)

  融合后过滤:同群约束、`superseded_by IS NULL`、时间窗口。
  **`speakerIds` 改为加权而非硬过滤** —— 别人说过的相关内容也能进候选,注入时标明是谁说的。这条直接修掉「只查最后一个说话人」的窄口子。

- **验收**:`test/memory.ts` 里「相关话题能召回」的用例通过(见第八节)

### P3 — 记忆存取与写入流水线

- `memory/store.ts` 替代 `storage/userMemory.ts`。对外保留兼容形态的 `getMemoryContext(userIds)` / `hasMemory(userId)` / `getManualAliases()` —— **后者被 `aliasIndex.ts:95` 依赖,签名不能变**
- 淘汰不再硬截断前 6 条,改为按 `score = confidence × exp(-Δt/τ) × log(1 + hits)` 排序,非 `pinned` 且超出上限的软删
- `memory/extract.ts` 替代 `summarizeUserTraits`。仍每 30 句触发(逻辑从 `userMemory.ts:116-135` 迁移),但改成 Mem0 式抽取-调和循环:
  1. 取该用户未失效的记忆条目(带 id、kind、pinned)
  2. 调 `POST /llm/memory/extract`,收 `{ ops: [{op, id?, kind, text, confidence}] }`
  3. 应用 ops:`pinned` 忽略 UPDATE/DELETE;DELETE 写 `superseded_by`;UPDATE 保留 `first_seen` 并累加 `hits`
  4. 新增/变更条目入向量化队列(批量、异步、不阻塞回复)
- **失败回填沿用现在 `userMemory.ts:149-159` 的做法**(消息放回缓冲区头部 + `MAX_BUFFER` 上限),这块设计是对的
- **验收**:ops 应用的单测通过,尤其 pinned 保护和软删可见性

### P4 — 服务层与工具

- `src/service/llm/index.ts` 新增:
  - `embedTexts(texts): Promise<number[][]>` → `POST /llm/embed`
  - `extractMemory(...)` → `POST /llm/memory/extract`
  - `segmentTopics(...)` → `POST /llm/topic`
  - `getLLMReplyWithTools(messages, context, tools, maxRounds)` → `/llm/reply` 扩展 `tools`/`toolResults`
- `memory/tools.ts`:工具定义 + 本地执行器

```ts
recall_memory { query: string, about?: string }
recall_chat   { query: string, speaker?: string, days?: number }
```

  `about`/`speaker` 是**名字**,经 `aliasIndex.resolve(groupId, name)` 转 userId。返回紧凑文本。
- **工具循环跑在 bot 端** —— 记忆数据在本地文件,不能让服务端反向依赖 bot
- `REPLY_TIMEOUT`(`service/llm/index.ts:11` 现为 90s)按轮数重新核算

### P5 — 组装

改 `group/generateReply.ts`:

- 档案行仍然预注入(push 通道保留,便宜且稳定)
- 删掉 `getHistoryHits` 及 `HISTORY_COOLDOWN` 那套关键词旧账逻辑,改由模型 tool call 拉
- 轮数预算配置化:`aiReply.memory.toolRounds = { mention: 1, initiative: 0 }` —— 主动插话本来就是随口一句,不值得花往返
- 注入顺序保持「稳定内容在前、易变内容在后」,**不要破坏 `cacheControl`(`storage/message.ts:74`)的缓存断点**
- `config_demo.json` 补上新配置项

### P6 — 巩固任务

`src/tasks/memoryConsolidate.ts`,照 `src/tasks/clean.ts` 的 `SimpleIntervalJob` 模式写,注册进 `src/index.ts` 的 `nnkSchedule.loadJob`。每 24h:

1. 增量 ingest 新备份行
2. `initiativeList` 群的日志切话题 → `topic` → 向量化
3. 合并近重复记忆、重复出现的 episode 升 confidence、老 episode 衰减
4. 执行淘汰

### P7 — 迁移与清理

- `scripts/migrate-memory.ts`:`data/memory/user/*.json` → memory 表
  - `traits` → `kind='trait'`, `confidence=0.6`
  - `relations` → `kind='relation'`, `pinned=1`
  - `aliases` → `kind='alias'`, `pinned=1`
  - `nickName` 落到对应 memory 行的 owner 元信息
- 全量 ingest `data/memory/chat/*.txt`,全部 memory item 向量化
- **迁移完成后直接删除 `data/memory/user/`**(开发期,用户已确认不需要回滚)
- 删除 `history/search.ts`、`history/keywords.ts`、`storage/userMemory.ts`
- 切换 `aliasIndex.build()` 的数据源:「扫 180 天文件」→「查 `chat_line` 表」,启动更快

---

## 七、服务端(另一个 repo)需要配套的接口

bot 这边按这四个契约写客户端,服务端同步实现:

| 端点 | 输入 | 输出 |
|---|---|---|
| `POST /llm/embed` | `{ texts: string[] }` | `{ vectors: number[][] }` |
| `POST /llm/memory/extract` | `{ nickName, messages, existing: [{id, kind, text, pinned}] }` | `{ ops: [{op:'ADD'\|'UPDATE'\|'DELETE'\|'NOOP', id?, kind, text, confidence}] }` |
| `POST /llm/topic` | `{ lines: [{id, userId, text}] }` | `{ topics: [{summary, userIds, lineFrom, lineTo}] }` |
| `POST /llm/reply`(扩展) | 原参数 + `tools`, `toolResults` | `{ text }` 或 `{ stopReason:'tool_use', toolUse:[{id, name, input}] }` |

向量维度不写死,从返回值推断并存进 `meta`,换模型时校验维度一致性。

---

## 八、验证

- **`test/memory.ts`(新)**:临时 DB 跑 ingest → 检索 → ops 应用 → 淘汰全链路。断言 BM25 排序、RRF 融合、pinned 保护、软删可见性。沿用 `test/historySearch.ts` 的 `check()` 断言 + fixture 自清理模式(`test/historySearch.ts:13-22,141-160`)
- **`test/historySearch.ts`**:改写成对 `retrieve.ts` 的测试。保留原有语义用例(跨用户命中、bot `[0]` 行排除、时间窗口),**新增「同义/相关话题能召回」用例 —— 这是本次重做的验收点**
- **`test/nameResolve.ts`**:不动。用来确认 `aliasIndex` 换数据源后行为无回归
- **迁移比对**:迁移前先记下 `getMemoryContext()` 对一批 userId 的输出,迁移后比对(应为超集)
- **端到端**:`yarn dev` 连测试群,分别验证被 @(1 轮 tool)与主动插话(0 轮)两条路径,看日志里 tool 调用参数和召回条数是否合理
- `yarn lint` 必须过(airbnb-base + TS,配置见 `.eslintrc`)

---

## 九、风险

- `better-sqlite3` 是 native 模块,部署走 pm2 + tsx(`ecosystem.config.cjs`),需确认目标环境有预编译二进制,否则要装编译工具链
- 工具循环让回复延迟不再是常数,`REPLY_TIMEOUT` 要重算
- 首次全量分词入库量大时耗时。用户已确认**可以阻塞启动**,先跑完再进主流程
- FTS5 普通表的 rowid 需手工与 `chat_line.id` 对齐,写入路径必须走同一个事务,否则两表会飘
