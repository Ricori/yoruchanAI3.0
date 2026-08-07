# 记忆系统架构重做技术档案

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

## 二、已确认的前提

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
| `storage/userMemory.ts` | 替换为 `memory/store.ts` + `memory/extract.ts`,**已删除** |
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

**`memory/userDict.ts` —— 自定义词典(必需,不是可选项)**

jieba 默认词典缺很多词,缺的后果是**用户问的东西被静默丢掉**:「手办」被切成「手 办」,两个单字都短于检索词最小长度、进不了候选,于是查「上次说的那个手办」实际只拿「上次」去检索,召回一堆「我上次下车了」。

初始清单是从 19 万行真实日志挖出来的(统计被切成单字却频繁相邻的字串),主要是三类:群友名字(`小雏` 出现 1857 次)、游戏与 ACG 词(`原神`/`舞萌`/`打轴`)、群内梗(`咩哇抛瓦`)。补上之后同一个问题召回的是真正在聊手办的记录。

两个必须守住的点:

- **词典变更必须触发全文索引重建。** 索引侧和查询侧必须用同一套分词,否则改完词典老数据就再也召不回。`segment.ts` 导出词典指纹,`ingest.ts` 比对 `meta.segment_dict`,不一致就按 `chat_line`/`memory` 现有数据重建两张 FTS 表。19 万行重建实测 2.9s。
- **重建时不能用 `iterate()`。** better-sqlite3 在游标没关的时候不许对同一个连接写入,必须按 id 分批 `all()`。

jieba 已经认识的词会被自动跳过,不用担心加重复了反而把它原有的词频改低。

### P2 — 混合检索

- `memory/vector.ts`:embedding 存取(Float32Array ↔ BLOB)+ 暴力余弦 top-K
- `memory/retrieve.ts`:

```ts
recallMemory(groupId, { query, aboutUserIds?, limit })
recallChat  (groupId, { query, speakerIds?, days?, limit })
```

多路召回 + RRF 融合(`score = Σ weight/(60 + rank)`):
  - 字面:**一个检索词一路**,各自 FTS5 MATCH → `bm25()` 排序 → top 30
  - 语义:`/llm/embed` 向量化 query → 与 `embedding` 表余弦 → top 30(topic 命中展开成 `chat_line` 区间,一个话题最多展开 8 行)

  融合后过滤:同群约束、`superseded_by IS NULL`、时间窗口。
  **`speakerIds` 改为加权而非硬过滤** —— 别人说过的相关内容也能进候选,注入时标明是谁说的。这条直接修掉「只查最后一个说话人」的窄口子。
  `aboutUserIds` 相反,是硬过滤:问某个人就只翻他的档案,混进别人的是噪音。

**实施时踩到的三条,写死在代码里别再改回去:**

1. **查询串必须过一遍 `segment()` 再包成双引号词组。** 索引侧存的是分词后的 seg,查询侧不分词就对不上:实测 `MATCH '"手办"'` 命中 0 行,`MATCH '"手 办"'` 命中 24 行。不加引号则空格被当成 AND,会召回「手」和「办」分别出现在任意位置的行。

2. **join 必须写成 `chat_fts f CROSS JOIN chat_line c ON c.id = f.rowid`。** 用普通 JOIN 时 SQLite 会挑 `chat_line` 走 `idx_chat_group_date` 当外层,再对每一行重跑一次 MATCH —— 6 万行的群实测 **3673ms**;`CROSS JOIN` 强制 FTS 当外层、内层走主键回表,同一条查询 **2ms**。`memory_fts` 同理。

3. **不要把所有检索词 OR 进一条 MATCH。** BM25 的长度归一会让「好吃好吃」这种两个 token 的行拿到极高分,常见词于是盖过稀有词 —— 查「拉面好吃吗」召回的全是「好吃」。改成一词一路、权重取该词的 TF-IDF(归一化到和为 1)再融合,排序维度才真的是稀有度。实测「最近在玩什么游戏」由此从混着「宜宾最近」「最近有点不顺」变成清一色的游戏话题。

4. **语义那一路必须有相似度下限**(`MIN_SIMILARITY`)。余弦只排序不判断有无:没有下限时,哪怕全库话题都跟问题无关,最不相关的那个也会以 rank 1 进入融合,反过来压掉真正的字面命中 —— 实测查「大家在聊什么游戏」召回了一串「好困」。阈值跟 embedding 模型强绑定,换模型必须重新量:`qwen3.7-text-embedding` 上该命中的最低 0.446、该落空的最高 0.394,中间有空档;同一组样本换 `text-embedding-v4` 是 0.409 对 0.409,**根本切不开**。

5. **话题展开出来的行要过一遍内容过滤**。一段对话里夹着大量只发 `[表情]`、`[图片]`、`？` 的行,展开时会一并带出来白占注入名额。

### 语义召回目前的边界

已经能做到字面检索做不到的事(实测,零字面重合):

| 问法 | 召回 |
|---|---|
| 有人跟朋友闹掰了吗 | `[- Randy_Dust HQ-]说：和一个几年的老朋友爆了` |
| 谁早上起不来 | `[丈育小雏]说：小雏不想起床怎么办` |
| 显卡多少钱 | 语义路正确地一条都不给(全在下限之下),结果等同纯字面 |

但**话题层面的误命中还没解决**:「大家在聊什么游戏」仍会命中「好困」那个话题。话题概括都是「谁和谁在聊什么」的同一种腔调,这层共性把基线相似度整体抬高了。可能的解法是对话题向量做去均值消掉共性,但要等 P6 攒出全量话题再校准 —— 现在只有一天的 10 个话题,拿这个调参就是过拟合。

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

**实施时的三处调整:**

1. **旧档案迁移从 P7 提到了 P3。** 一旦 `aliasIndex` / `mention` / `generateReply` 改读新 store,`data/memory/user/*.json` 就成了孤儿数据 —— 70 个人的档案会当场消失。所以 `memory/migrate.ts` 现在由 `ingestOnStartup()` 自动调用,幂等,跑完在 `meta.legacy_user_migrated` 记一笔。**不删源文件**,留着人工比对。

2. **`memory` 表放不下 `nickName`,新增了 `user_profile` 表(schema v2)。** memory 每行是一条事实,而昵称是「每人一个」的属性。迁移把 JSON 里的 `nickName` 落到这张表,`noteNickName()` 在收消息时顺带更新(带内存缓存,昵称没变就不写库)。

3. **衰减按天取整,不是按毫秒。** 时间常数是 30 天,毫秒级的先后毫无意义,但会让同一批写入的条目因为相差几毫秒排出随机顺序 —— 实测迁移后 70 个人里有 31 个的档案行顺序被打乱(`名字叫XX` 被挤到中间)。改成按天后 69/70 与旧实现逐字一致,剩下 1 个是那人有 7 条 trait、注入上限 6 条,属预期。`listUserMemories` 同时改成 `ORDER BY id` + 稳定排序,同分保持写入顺序。

**迁移实测**:70 人 → 420 条 trait、9 条 relation、3 条 alias、70 条 user_profile,12 条 pinned;强制重跑写入 0 条。

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

**实施要点:**

- **服务端无状态,所以 bot 每轮都要把上一轮的 `tool_use` 原样带回去。** Anthropic 要求 `tool_result` 的前一条必须是发出对应 `tool_use` 的 assistant 消息,服务端不存会话,只能靠 bot 重建。契约里因此多了 `toolRounds: [{use, results}]`。
- **最后一轮不再下发 `tools`**,逼模型必须出文本,否则它可能一直要求继续调用。
- **工具定义要带 `cache_control`。** Anthropic 的缓存前缀顺序是 `tools → system → messages`,不给工具块打标记的话,带工具的请求会把人设块的缓存整个顶掉。
- **超时分两档**:工具决策轮 75s(只吐一个工具调用,但不能短过服务端「35s + 超时重试一次」,否则 bot 会在服务端还在重试时先放弃),最终出文本那轮仍是 90s。带工具时最坏耗时翻倍。
- 一轮里模型可能同时要调多个工具,`Promise.all` 全部执行完再一起回传(实测确实会发生:问「浅秋是个什么样的人」时它同时调了 `recall_memory` 和 `recall_chat`)。

**`recallMemory` 的两处修正**(都是端到端实测暴露的):

1. **指定了 `about` 时,向量检索的范围要先收窄到这些人的条目。** 否则 top-30 会被别人的记忆占满,按 owner 过滤完一条不剩。
2. **检索落空时要兜底把该人的档案端出来。** 问「浅秋是个什么样的人」,检索词是「性格」「关系」这类抽象词,而库里存的是「爱发表情包」「脸盲严重」这类具体事实,字面对不上、向量也未必够近 —— 但这种问句本来就该直接给档案。兜底只在指名道姓时生效,没指定人不兜底(否则会灌一堆无关档案)。判断要看**最终结果**而不是候选:候选非空但全被可见性筛掉,同样算空手。

### P5 — 组装

改 `group/generateReply.ts`:

- 档案行仍然预注入(push 通道保留,便宜且稳定)
- 删掉 `getHistoryHits` 及 `HISTORY_COOLDOWN` 那套关键词旧账逻辑,改由模型 tool call 拉
- 轮数预算配置化:`aiReply.memory.toolRounds = { mention: 1, initiative: 0 }` —— 主动插话本来就是随口一句,不值得花往返
- 注入顺序保持「稳定内容在前、易变内容在后」,**不要破坏 `cacheControl`(`storage/message.ts:74`)的缓存断点**
- `config_demo.json` 补上新配置项

**实施要点:**

- **整块 `memory` 配置可省略**,省略时按代码里的 `DEFAULT_TOOL_ROUNDS` 走。现有的 `config.json` 不改也能直接跑。
- **0 轮时走原来的无工具请求**(不下发 `tools`),缓存前缀与改造前逐字一致 —— 主动插话是最高频的路径,不能让它为了一个用不上的工具块多付缓存成本。
- **消息数组的拼装顺序没变**:`[...history, 档案行?, 主动插话提示?]`。工具结果不再以 user 消息的形式插进来,而是走 `tool_result` 块由服务端追加在最后,`history` 里的 `cacheControl` 断点一个都没动。
- **备份日志的 `[旧账 N]` 标记改成 `[工具 N]`**,记的是模型主动调了几次召回工具。`FormattedMessage.historyHits` 相应改名 `toolCalls`。**`ingest.ts` 的 `BOT_MARK_RE` 两个都认** —— 关键词时代写下的 19 万行日志里还有 `[旧账 N]`,不认就会把它当正文索引进去。

**顺带删掉的**(改完之后就没有 importer 了):`history/search.ts`、`history/keywords.ts`、`test/historySearch.ts`。第八节要求保留的四个语义用例(跨用户命中、bot `[0]` 行排除、时间窗口、同义话题召回)在 `test/memory.ts` 里都已经有对应断言,不存在覆盖缺口。

### P6 — 巩固任务

`src/tasks/memoryConsolidate.ts`,照 `src/tasks/clean.ts` 的 `SimpleIntervalJob` 模式写,注册进 `src/index.ts` 的 `nnkSchedule.loadJob`。每 24h:

1. 增量 ingest 新备份行
2. `initiativeList` 群的日志切话题 → `topic` → 向量化
3. ~~合并近重复记忆、重复出现的 episode 升 confidence、老 episode 衰减~~ —— 见下,前两条已在别处覆盖,第三条不该做
4. 执行淘汰

逻辑在 `memory/consolidate.ts`,任务壳子在 `tasks/memoryConsolidate.ts`(`AsyncTask` + `preventOverrun`)。

**第 3 步为什么砍掉:**

- **「合并近重复记忆」用向量阈值做不了。** 实测 432 条真实记忆、同一个人内部 1132 对两两比较,相似度最高的一对是 `0.772「常自称乃乃香」vs「自封的妈妈，把乃乃香当女儿」`—— **不是重复**,合了就毁掉一条关系事实。而真正的重复(`0.741「擅长IT对抗」vs「热衷智斗IT」`、`0.716「幽默风趣」vs「喜欢开玩笑」`)分数更低。最高分是假阳性,任何阈值都切不开。去重本来就该由写入侧做:`extract` 每次都带着已有条目让模型调和,它发同一件事时给的是 UPDATE 而不是 ADD,那是带上下文的语义去重,比这里用余弦硬猜靠谱。
- **「重复出现升 confidence」已经在写入侧做了** —— `applyOps` 里 UPDATE 和同文本 ADD 都会 `hits + 1`。
- **「老 episode 衰减」不需要单独跑。** 衰减是 `memoryScore` 在读取和淘汰时算出来的,不是存下来的状态,写一遍反而会把数据搞乱。

**实施要点:**

- **重跑某一天前先清掉那天的话题和向量。** 上一轮跑到一半失败(或进程被杀)时水位不会推进,下轮会重来这一天;不清就会写出重复话题。实测把水位倒回去重跑,那几天的话题数是 `2→1、5→4、2→2`(替换)而不是 `4、10、4`(叠加),孤儿向量 0 条。
- **一天内的分段可以并发**(`CHUNK_CONCURRENCY = 3`),段与段互不依赖。
- **天数和调用次数都要封顶**(`MAX_DAYS_PER_RUN = 3`、`MAX_CHUNKS_PER_RUN = 40`),否则首次跑会把几十天的积压一次性打满额度。
- **失败自愈**:切话题时向量化失败的、以及抽取时服务不可用漏掉的,都会被 `backfillMissingVectors` 在下一轮捞回来。

**吞吐实测(必须知道)**:`/llm/topic` 单次 100 行要 **40~80s**,比早先小样本上量到的 19~53s 慢不少。按这个速度:

| 群 | 日均行数 | 每天需要的段数 | 并发 3 时每天耗时 |
|---|---|---|---|
| 1087024871 | 56 | 1 | ~45s |
| 301750074 | 2793 | 28 | ~12min |

40 段的预算意味着**最忙的那个群每轮只能消化约 1.4 天**,22 天积压要十几轮(十几天)才追得平。日常增量(每天 1 天)完全跟得上,只是首次铺底慢。要加快就调大 `CHUNK_CONCURRENCY`,或者先把 `[表情]`/`早`/`好困` 这类无内容行滤掉再送(粗估能砍掉三四成体量)。

### P7 — 迁移与清理

- ~~`scripts/migrate-memory.ts`~~ **已在 P3 完成**(`memory/migrate.ts`,理由见 P3)

**`aliasIndex.build()` 换数据源(已完成)**:「扫 180 天备份文件」→「一条 `GROUP BY (group_id, user_id, nick)` 查 `chat_line`」。逐项比对过两种实现的产出,别名集合与最后活跃日期完全一致。

但**「启动更快」这个预期没兑现**:实测 167ms → 144ms,只快 1.2 倍。原本以为瓶颈是读几百个文件,实际瓶颈在 `normalizeAlias` 的字符串处理,换数据源省不掉。真正的收益是不再依赖备份文件还在原地,以及代码少了一半。

### 换数据源时挖出来的一个真 bug

比对两种实现时发现新的比旧的少一个别名(`2942022479:临璞`)。追下去是 **`parseBackupLine` 吃不下 CRLF 行**:文件按 `\n` 切完尾部留着 `\r`,而 JS 正则里的 `.` **不匹配 `\r`**,于是 `^\[(\d+)\](.*)$` 匹配失败,整行被当成格式不对**静默丢掉**。

全库 15 行受影响(2 个文件),其中 2 行是正常发言。已在 `parseBackupLine` 里剥掉尾部 `\r` 并补了断言,重置这两个文件的水位后补回了 2 行。

**这个 bug 之前躲过了 P1 的验收**,因为当时「备份总行数 vs `chat_line` 行数」两边都是用同一个 `parseBackupLine` 数出来的 —— 自己和自己比,永远一致。教训是验收口径不能和被测实现同源。

### 多行消息的续行(已修)

同一次排查顺带量出来:全库 199768 行里,**4871 行(2.4%)解析不了**,它们是**消息正文自带换行**被写成多行后的续行。备份格式是一行一条消息,而群友粘贴的长公告、转发内容里带 `\n`,于是只有带 `[userId][昵称]` 前缀的第一行进了索引,后面几行整段检索不到。

修法没动备份格式(第三节要求 `storage/message.ts` 不动),只改读取侧:`parseFileMessages()` 把「不以 `[数字]` 开头且非空」的行**并进上一条消息**,用空格连接(不用换行 —— 注入时一条命中占一行,正文带换行会把格式冲散)。判据用 `^\[\d+\]` 而不是 `^\[`,`[图片]` 这类占位符照样接得回去。

**存量数据靠 `meta.ingest_version` 就地修正,不能删表重导** —— `chat_line.id` 一重编,`topic.line_from/line_to` 指的就全是错地方了。所以是按 `(group_id, date_key, seq)` 找到原行、`UPDATE` 正文再重建那一行的 FTS。实测**就地修正 974 条消息、耗时 1.9s**,`max(id)` 不变、58 个话题的区间引用全部仍然有效、FTS 对齐 0;再跑一次 123ms 空转。

改了 `parseFileMessages` 的行为就把 `INGEST_VERSION` +1,启动时会自动按新规则修一遍存量。

顺带在 `tools.ts` 里加了单条召回结果 120 字的截断:合并之后一条长公告就是一条消息,整段塞回模型会把上下文吃光。
- 全量 ingest `data/memory/chat/*.txt`(P1 已完成),全部 memory item 向量化(接口部署后由 `embedQueue` 补齐)
- **确认无误后删除 `data/memory/user/`** —— 迁移不会自动删。比对已通过(70 人里 69 人的档案行与旧实现逐字一致,剩下 1 个是那人存了 7 条 trait 而注入上限 6 条),**删不删由用户执行**,不代劳:这是不可逆的真实数据
- ~~删除 `history/search.ts`、`history/keywords.ts`、`storage/userMemory.ts`~~ **都已删除**(分别在 P5 / P5 / P3,改完调用方后它们就没有任何 importer 了)
- `service/llm` 里的 `summarizeUserTraits` 也已经没人调(服务端 `/llm/summarize` 端点仍在),确认不需要后可一并删
- 切换 `aliasIndex.build()` 的数据源:「扫 180 天文件」→「查 `chat_line` 表」,启动更快

---

## 七、服务端(另一个 repo)需要配套的接口

bot 这边按这四个契约写客户端,服务端同步实现:

仓库在 `D:\Development\nonoka-service-cf`(Hono + Cloudflare Worker)。前三个**已实现并本地验证**,`/llm/reply` 的 tools 扩展留到 P4。

| 端点 | 输入 | 输出 | 状态 |
|---|---|---|---|
| `POST /llm/embed` | `{ texts: string[] }` | `{ vectors: number[][] }` | ✅ |
| `POST /llm/memory/extract` | `{ nickName, messages, existing: [{id, kind, text, pinned}] }` | `{ ops: [{op:'ADD'\|'UPDATE'\|'DELETE', id?, kind, text, confidence}] }` | ✅ |
| `POST /llm/topic` | `{ lines: [{id, userId, text}] }` | `{ topics: [{summary, userIds, lineFrom, lineTo}] }` | ✅ |
| `POST /llm/reply`(扩展) | 原参数 + `tools`, `toolRounds` | `{ text }` 或 `{ stopReason:'tool_use', toolUse:[{id, name, input}] }` | ✅ |

`toolRounds` 是 `[{use: [{id,name,input}], results: [{id, content}]}]`,即已经跑完的历次工具轮次。三个参数全可选,不传时行为与老接口逐字一致。

向量维度不写死,从返回值推断并存进 `meta`,换模型时校验维度一致性(`vector.ts` 已做)。

**调用方必须知道的三条上限:**

1. **`/llm/embed` 单次最多 200 条**。上游 DashScope 兼容接口一次只收 10 条,服务端按 10 切批并发再拼回原序;超过 200 条会占掉太多 Worker 子请求配额,直接 400。任一批失败整体返回 502 —— 不能只返回成功的部分,调用方是按下标把向量对回记忆条目的,缺一条就全错位。
2. **`/llm/topic` 单次最多 100 行**。实测 150 行要 19~53s、波动极大并撞过 60s 超时,所以 P6 必须把一天的日志切成 ≤100 行的段分别请求(超时已放宽到 90s)。
3. **`extract` / `topic` 失败返回 502 而不是空结果**。空数组的语义是「确实没有变化」,和「调用失败」必须分开,否则 P3 的失败回填逻辑会把没总结成功的消息当成已处理丢掉。

服务端已对 `ops` 和 `topics` 做过一轮清洗:未知 `kind` 退成 `trait`、缺 id 的 UPDATE/DELETE 丢弃、行号越界或倒置的话题丢弃。但 **pinned 保护仍必须在 bot 端强制执行**(第四节决策 4),prompt 里的约束只是第一道。

---

## 八、验证

- **`test/memory.ts`(新)**:临时 DB 跑 ingest → 检索 → ops 应用 → 淘汰全链路。断言 BM25 排序、RRF 融合、pinned 保护、软删可见性。沿用 `test/historySearch.ts` 的 `check()` 断言 + fixture 自清理模式(`test/historySearch.ts:13-22,141-160`)
- **`test/historySearch.ts`**:改写成对 `retrieve.ts` 的测试。保留原有语义用例(跨用户命中、bot `[0]` 行排除、时间窗口),**新增「同义/相关话题能召回」用例 —— 这是本次重做的验收点**
- **`test/nameResolve.ts`**:不动。用来确认 `aliasIndex` 换数据源后行为无回归
- **迁移比对**:迁移前先记下 `getMemoryContext()` 对一批 userId 的输出,迁移后比对(应为超集)
- **端到端**: （用户手动验证）`yarn dev` 连测试群,分别验证被 @(1 轮 tool)与主动插话(0 轮)两条路径,看日志里 tool 调用参数和召回条数是否合理
- `yarn lint` 必须过(airbnb-base + TS,配置见 `.eslintrc`)

---

## 九、风险

- `better-sqlite3` 是 native 模块,部署走 pm2 + tsx(`ecosystem.config.cjs`),需确认目标环境有预编译二进制,否则要装编译工具链
- 工具循环让回复延迟不再是常数,`REPLY_TIMEOUT` 要重算
- 首次全量分词入库量大时耗时。用户已确认**可以阻塞启动**,先跑完再进主流程
- FTS5 普通表的 rowid 需手工与 `chat_line.id` 对齐,写入路径必须走同一个事务,否则两表会飘
