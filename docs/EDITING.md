# 自己改这个主页

这一页只回答一个问题：**不找任何人，怎么自己改这张主页。**

结论先说：README 上你看到的每一个字，都不在 README 里，而在
[`scripts/config.json`](../scripts/config.json)。在浏览器里改那一个文件，
提交，大约 30 秒后页面就换了。不用装 Node，不用 clone，不用命令行。

**一个例外，而且是故意的**：`03 SELECTED WORK` 放哪几张卡、按什么顺序，
由 GitHub 主页上的 **Pinned repositories** 决定，不在 config 里——改那个要去主页上
点 `Customize your pins`。详见第四节。

---

## 一、原理（读一遍，之后不用再想）

GitHub 的 README 不能跑脚本，只能放图片。所以这一页上每一块——标题、卡片、
热力图、按钮——都是一张**已经画好并提交进仓库的 SVG 图片**，放在
`assets/generated/`。

画图的是仓库里的机器人（GitHub Actions 里那条 `Rebuild panels`）。它在两种
时候动：

| 什么时候 | 触发条件 |
|---|---|
| 你改了 `scripts/` 里的任何文件并提交 | 立刻，约 30–60 秒画完 |
| 每 6 小时一次 | 定时（抓最新的贡献数据、星标、动态） |
| 你手动点一下 | Actions → Rebuild panels → Run workflow |

所以：**改文字 = 改 `config.json` = 页面自己变**。这条链路不需要我参与。

---

## 二、怎么改（浏览器，六步）

1. 打开 <https://github.com/yunmin311/yunmin311/blob/main/scripts/config.json>
2. 右上角铅笔图标 ✏️（Edit this file）
3. 改文字
4. 页面底部 **Commit changes...**
5. 直接选 **Commit directly to the main branch**，绿色按钮
6. 回主页，等半分钟刷新

想改之前先看一眼效果的话，编辑器顶上有 **Preview** 页签，能检查 JSON 有没有写坏
（写坏的地方会标红）。

---

## 三、哪一段管哪一块

| `config.json` 里的键 | 对应页面上的 |
|---|---|
| `hero.lines` | 最上面那三句会打字的话 |
| `sections` | 每个分节的编号和标题（01 ABOUT ME 这种），`sub` 是标题下面那行小字 |
| `about.name` / `about.paragraphs` | 01 里的名字和两段自我介绍 |
| `exploring` | 01 里那排「在研究什么」的小方块 |
| `principles` | 01 底部那两条原则 |
| `cardOverrides` | 03 作品卡上的**文字**（名字、`why`、`tags`）。**它决定不了放哪几张卡**——那是 pin 决定的（详见第四节） |
| `contact` | 07 的联系方式按钮，`enabled: false` 就是关掉不显示 |
| `fortunes` | 08 每天换一句的那句话，往数组里加就行，加多少都可以 |
| `quote` / `tiles` / `display` | 主页上**没有**用，只出现在 `docs/COMPONENTS.md` 里当样例 |
| `motion` | 每个模块的动画开关。整页静止就把 `enabled` 改成 `false` |
| `activity.days` / `activity.limit` | 「最近动态」看多久以内、最多列几条 |
| `languageScopeOptions` | 语言占比**怎么算**（算谁的提交、排除哪些语言）。算**哪些仓库**由 GitHub 决定——你账号下全部 public 自有仓库，不在这里配 |

### 哪些会自己变，哪些不会

这一条以前踩过坑，所以单列出来：

| 会自己变（每 6 小时按真实数据重算） | 不会自己变（只有你改 config.json 才变） |
|---|---|
| 作息热力图 · 语言占比的数字 · 最近星标 · 最近动态 · 一年的贡献图 · 每日一句 | **作品卡上你写的那几个字**（`name`、`why`、`tags`）、分节标题、开场三句话、每日一句的池子、联系方式 |
| **作品卡的入选名单和排列顺序**（= GitHub 上的 pin，见第四节） | 作品卡**长什么样**（尺寸、字体、配色、动画） |
| 语言占比统计的**范围**（= 账号下全部 public 自有仓库） | |

换句话说：卡片上的文案是「策展」内容，不会自动换；卡片的**入选名单和排列顺序**
跟着 GitHub 上的 pin 走，而**语言统计的范围**跟着你的仓库列表走（新开一个 public
仓库就自动进、archive 掉就自动出，都不用改 config）。

> **为什么以前看起来像冻住了。** 卡片内容 100% 来自 config，所以一次健康的构建会
> 把卡片图字节级一模一样地重画一遍，工作流提交不了任何东西、直接报 `no change`
> 收工。这本身是对的——但它和「选卡规则本身已经过时」长得完全一样。
> 现在名单来自 GitHub 上的 pin，所以「页面没变」只可能意味着「pin 没变」。
> `scripts/check.mjs` 每次都会核对 README 里那一块和记录下来的名单是否一致，见第六节。

---

## 四、作品卡：名单来自 pin，文字来自这里

### 名单：GitHub 上的 Pinned repositories

**放哪几张卡，是你在 GitHub 主页上 pin 出来的。** 操作只有一步：

```text
github.com/yunmin311 → 主页右上 Customize your pins → 勾选 / 拖动排序 → Save
```

下一轮 rebuild（最多 6 小时，或者你手动 Run workflow）就会跟上。**不用改 config，
不用改代码。**

- **顺序就是 pin 的顺序**，不重排、不打分。
- **pin 几张就显示几张。** 只 pin 了 4 个就是 4 张卡，不会给你补「最近的项目」。
- 全都不 pin 就一张都不显示——那是你的决定，页面照做。
- 读的是 GitHub 官方 GraphQL 的 `pinnedItems`，不是扒网页。

> 为什么不再用「最近最活跃的 6 个」。那个规则要回答的问题是「哪六个项目值得展示」——
> 这本来就是你的判断，而 pin 就是你已经做过这个判断的地方。让代码再算一遍，等于
> 两套策展互相打架，而且机器那套会赢。所以 `tier` / `coreLeadDays` /
> `hysteresisDays` / `pinned` / 最近度打分这些全部删掉了，config 里也没有了。

### 文字：`cardOverrides`

名单是 pin 定的，**卡片上那几个字仍然是你写的**，在 `cardOverrides` 里，按
`owner/name` 索引：

```json
"yunmin311/context-distiller": {
  "name": "Context Distiller",
  "why": "为什么这个东西存在——一到两句。",
  "tags": ["TypeScript", "React 19", "WXT", "Manifest V3"]
}
```

- **`name`** —— 卡片顶上那块牌子上的名字。
- **`why`** —— 正文那一两句。这就是卡片存在的理由，也是唯一有长度上限的地方（见下）。
- **`tags`** —— 底部那行小字。最多两行，四个短词是舒服的量。

这里**只影响卡片上的字**。语言占比统计哪些仓库、作品卡放哪几张，都不由这个文件决定。

**新 pin 一个还没登记过的仓库，不需要动任何代码。** 卡片会自动用仓库自己的
description、primary language 和 topics 拼出来：`why` 用 description，`tags` 用
主语言 + topics。构建日志里会把这些列在 `unedited pins` 下面——意思是「这张卡现在
用的是 GitHub 上的描述，想换成自己写的句子就往 `cardOverrides` 里加一条」。

- description 太长时会被**按词边界截短**（加 `…`），不会截半个单词，也不会让构建失败
  ——那段文字在 GitHub 上，不归这个仓库管，用错误来逼你改是没道理的。
- description 为空时 `why` 就用仓库名本身。故意不做发挥：宁可是个明显的占位，
  也不要凭空生成一句关于别人项目的宣传语。
- 反过来，**你手写的 `why` 和 `tags` 超长了会直接构建失败**并且报出多了几行——
  手写的文字你改得动，报错是有用的。

逗号、括号这些分隔符前会去掉再补 `…`，所以「……instrument,…」这种不会出现。

### 长度的硬上限

六张卡等高，这是它们看起来像一整块而不是六张海报的原因。所以 `why` 有硬上限：
**英文约 180 个字符以内是安全的**（桌面 4 行 × 每行 53 字，手机 6 行 × 每行 36 字）。
上限定义在 `scripts/lib/cards.mjs`，工作卡和截断逻辑读的是同一份数字。

**页面顺序 = pin 顺序。** README 里那一整块卡片链接是构建自动重写的
（`SELECTED_WORK_START` / `SELECTED_WORK_END` 两个注释之间），**不要手改**——
改了会被下次构建覆盖，而且 `check.mjs` 会发现不一致并报错。

### 语言占比统计的是「整个账号」

`04 HOW I WORK` 里的语言占比，统计范围**不是上面那几张卡**，而是你账号下
**全部 public、你自己拥有、非 fork、非 archived 的仓库**，再排除主页仓库本身
（`yunmin311/yunmin311` —— 它只有一个 README，没有代码）。

两个面板回答的是两个不同的问题：作品卡是**你挑出来的精选**（一个关于品味的判断），
语言占比是**这些精选是从多大一摊工作里挑出来的**。之前让后者的范围等于前者，
结果是每个百分比其实只描述那 6 个仓库。

- 名单来自 GitHub GraphQL 的 `repositories`，**带分页**（每页 100，会一直翻到最后一页），
  不会「只取前 100 个然后假装完整」。
- 数字来自「我本人写的新增行数」，不是磁盘字节数——所以是先 clone 范围里的每个仓库
  再统计，**每个仓库每轮只 clone 一次**。
- 你新开一个 public 仓库，下一轮它就自动进统计；archive 掉一个，它就自动出去。
  **都不用改 config。**

某个仓库这一轮没读成功（网络抖了一下）时：

- 语言占比里它算「读不到」，会明确写出「15 个仓库里的 13 个」，**不会当成 0 行**；
- 如果**整份名单**都读不到，会沿用上一轮记下来的范围并在日志里说明，
  而不是画成「0 行」——读不到不等于没写过。

---

## 五、改坏了会怎样

**页面不会坏。** 图片是已经提交的文件，构建失败时它们原封不动，读者看到的还是上一版。

变化是：你会收到一封邮件 / 一条通知，仓库里出现一个叫
**「Panel rebuild failed」** 的 Issue，里面直接贴了报错的最后几十行。
两种错占了九成：

1. **JSON 语法** — 少一个逗号、多一个逗号、中文引号“”混进了英文引号 `"` 的位置。
   报错长这样：`SyntaxError: Unexpected token ... in JSON`，后面跟行号。
2. **手写的文字太长** — 报错会明说：
   `config.json: cardOverrides["yunmin311/xxx"].why does not fit a card`，
   或者在渲染阶段报 `work/xxx: "why" needs 7 lines on mobile, budget is 6`。
   两种都只要把 `why` 写短一点。
3. **README 和记录下来的名单不一致** — 报错长这样：
   `the README's SELECTED_WORK block does not match the recorded cards, in order`，
   后面会同时列出 README 里的顺序和记录里的顺序。几乎只有一个原因：
   `SELECTED_WORK_START` / `SELECTED_WORK_END` 之间被人手改了。
   把那一块还原成构建写的样子，或者在 Actions 里手动 Run workflow 让它重写一遍。

修法：回到 `config.json` 再编辑一次改掉；或者在仓库的 Commits 里找到那次提交，
点 **Revert** 撤回。修好后机器人自己重跑，Issue 可以手动关掉。

> 只有**你自己改文件**触发的失败才会开 Issue。每 6 小时那次定时跑挂了不开——
> 通常是 GitHub 接口抖了一下，下一轮自己就好了。
>
> **pin 读不到的时候不会失败，也不会换卡。** 日志里会出现
> 「holding SELECTED WORK at the last known-good cards」，意思是用上一轮记下来的
> 那一组卡继续画。**绝不会**临时换一批「最近活跃的」上去——采集失败不是关于项目的
> 证据，何况六小时后网络恢复了卡片还要换回来，那才是最难看的行为。

---

## 六、`config.json` 改不动的事

这些要动代码或者加文件，不是改配置能解决的：

- **02 THROUGH MY LENS 的照片** —— 需要往 `assets/photography/` 里放图，
  并在 README 里加对应的 `<picture>`。目前分节标题已经生成好在等图。
- **加一种新的联系方式按钮**（比如 Bilibili）—— 按钮图是画出来的，要在
  `scripts/panels/contact.mjs` 里加一个键。
- **加一个新模块 / 改配色 / 改版式** —— 在 `scripts/panels/` 和 `scripts/lib/`。
- **换字体** —— 字体是按现有文字裁过的子集，换字会缺字，要重裁。

---

## 七、两个需要偶尔看一眼的地方

- **60 天休眠**：GitHub 规定，公开仓库的定时任务在「仓库连续 60 天没有活动」后
  会被自动停用。机器人自己的提交算不算「活动」，官方文档没写死。所以如果哪天发现
  热力图不动了，先去 **Actions** 页面看 `Rebuild panels` 是不是被禁用了——
  被禁用会有一个 Enable workflow 的按钮，点一下就回来。
- **定时不是准时**：GitHub 明确说了排队任务在高负载时会延迟、极端情况下会被丢弃。
  `17 */6 * * *` 是意图，不是保证。急着看到结果就手动 Run workflow。

---

## 八、想在本机改（可选）

装了 Node 22 的话：

```bash
git clone https://github.com/yunmin311/yunmin311
cd yunmin311
node scripts/build.mjs --offline   # 用上次抓的缓存数据，不联网
node scripts/preview.mjs           # 生成 .preview.html，双击就能看
```

`--offline` 用 `scripts/.cache.json` 里的旧数据，只想调文字和排版时够用，也不会
去打 GitHub 的接口。
