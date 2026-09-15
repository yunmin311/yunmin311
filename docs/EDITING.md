# 自己改这个主页

这一页只回答一个问题：**不找任何人，怎么自己改这张主页。**

结论先说：README 上你看到的每一个字，都不在 README 里，而在
[`scripts/config.json`](../scripts/config.json)。在浏览器里改那一个文件，
提交，大约 30 秒后页面就换了。不用装 Node，不用 clone，不用命令行。

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
| `projects` | 03 作品卡的**唯一事实源**，同时也是语言占比统计的仓库来源（详见下面第四节） |
| `workSlots` / `coreLeadDays` / `hysteresisDays` / `stalenessToleranceDays` / `pinned` | 选卡规则的五个参数，**都是初始策略值不是实测结论**（详见第四节） |
| `contact` | 07 的联系方式按钮，`enabled: false` 就是关掉不显示 |
| `fortunes` | 08 每天换一句的那句话，往数组里加就行，加多少都可以 |
| `quote` / `tiles` / `display` | 主页上**没有**用，只出现在 `docs/COMPONENTS.md` 里当样例 |
| `motion` | 每个模块的动画开关。整页静止就把 `enabled` 改成 `false` |
| `activity.days` / `activity.limit` | 「最近动态」看多久以内、最多列几条 |
| `languageScopeOptions` | 语言占比**怎么算**（算谁的提交、排除哪些语言）。算**哪些仓库**由 `projects` 决定 |

### 哪些会自己变，哪些不会

这一条以前踩过坑，所以单列出来：

| 会自己变（每 6 小时按真实数据重算） | 不会自己变（只有你改 config.json 才变） |
|---|---|
| 作息热力图 · 语言占比的数字 · 最近星标 · 最近动态 · 一年的贡献图 · 每日一句 | **作品卡上的每一个字**（名字、`why`、`tags`、链接）、分节标题、开场三句话、每日一句的池子、联系方式 |
| **作品卡的成员和顺序**（按最近活跃度重排，见第四节） | 作品卡**长什么样**（尺寸、字体、配色、动画） |

换句话说：卡片上的文案是「策展」内容，不会自动换；卡片的**入选名单和排列顺序**是动态的。

> **为什么以前看起来像冻住了。** 卡片内容 100% 来自 config，所以一次健康的构建会
> 把卡片图字节级一模一样地重画一遍，工作流提交不了任何东西、直接报 `no change`
> 收工。这本身是对的——但它和「选卡规则本身已经过时」长得完全一样。
> 现在 `scripts/check.mjs` 会检查这件事，规则跑偏了会直接让运行失败，见第六节。

---

## 四、作品卡（唯一有长度上限的地方）

`projects` 数组里每一项：

```json
{
  "key": "context-distiller",
  "name": "Context Distiller",
  "why": "为什么这个东西存在——一到两句。",
  "tags": ["TypeScript", "React 19", "WXT", "Manifest V3"],
  "url": "https://github.com/yunmin311/context-distiller",
  "repo": "yunmin311/context-distiller",
  "tier": "core",
  "languages": "count"
}
```

- **`tier`** —— 偏好强度，**不是永久占位**：
  - `"core"` —— 强烈偏好。和对手比的时候先拿到 `coreLeadDays` 天的领先，
    但**仍然会退场**：落后太多的话名额就是别人的。这才是对的——
    一个两年没动的项目不该永远占住一张卡。
  - `"candidate"`（默认）—— 除了稳定性保护之外没有任何偏好。
- **`languages`** 决定它算不算进语言占比：
  - `"count"`（默认）—— 算。
  - `"exclude"` —— 是真实代码，但算进去会失真（生成物、vendored）。
  - `"n/a"` —— 没有可对比的「新增代码行」口径，比如纯样式表或提示词规范。
- `key` 是文件名。改了它，README 里那张图的路径要跟着改——**不想改路径就别动 `key`。**

`weight`（单项目分数下限）和 `hysteresis`（单项目保护天数）两个字段代码还认，
但**这一版刻意没在用**：它们和 `coreLeadDays` / `hysteresisDays` 是同一个意图的两种
写法，放在一起只会互相打架。要托住某个项目就调 `coreLeadDays`，
要稳住某张卡就调 `hysteresisDays`，两个都在 config 顶层。

### 全局的几个「旋钮」

下面这些在 `config.json` 顶层。**全部是初始策略值，不是实测结论**，觉得不对就改：

| 字段 | 作用 | 怎么调 |
|---|---|---|
| `workSlots` | 页面上放几张卡（默认 6，改它要连布局一起改） | —— |
| `coreLeadDays` | `core` 相对普通项目领先多少天 | core 掉下去了就调大，赖着不走就调小 |
| `hysteresisDays` | 挑战者要比在位者新多少天才换人 | 卡片来回闪就调大，想换的卡进不来就调小 |
| `stalenessToleranceDays` | 落后多少天算「规则跑偏了」并让构建失败 | 只影响报错，不影响展示 |
| `pinned` | **永不退场**的项目 key 列表 | 唯一能说「永远留在页面上」的地方，手改 |

**入选规则**（`scripts/lib/projects.mjs`）：`pinned` 先占位，然后所有项目按一个统一的
排序键竞争，其中 `core` 带 `coreLeadDays` 的领先。分数 = 0.6 × 最近度（距我最后一次
提交的天数，180 天线性衰减）+ 0.4 × 体量（我写的行数的 log10）。**刻意不用** star /
fork / 裸 commit 数——那些衡量的是观众，不是工作。

**语言占比统计的是「上面正在展示的那几张卡」**，不是整个 `projects` 池。因为它就贴在
作品卡下面，读者只会把它当成那排卡的注解；统计池子里没露面的项目，等于把数字挂在了
读者看不见的东西上。

六张卡等高，这是它们看起来像一整块而不是六张海报的原因。所以 `why` 有硬上限：
**英文约 180 个字符以内是安全的**（桌面 4 行 × 每行 53 字，手机 6 行 × 每行 36 字）。
超了不会被悄悄截断——构建会直接失败，并在报错里告诉你多了几行、被砍掉的是哪几个字。
`tags` 最多两行，四个短词是舒服的量。

**页面顺序由规则决定，不再等于你在 config 里写的顺序**，也不再等于 GitHub 上的 pin 顺序。
README 里那一整块卡片链接是构建自动重写的（`SELECTED_WORK_START` / `SELECTED_WORK_END`
两个注释之间），**不要手改**——改了会被下次构建覆盖，而且 `check.mjs` 会发现不一致并报错。

---

## 五、改坏了会怎样

**页面不会坏。** 图片是已经提交的文件，构建失败时它们原封不动，读者看到的还是上一版。

变化是：你会收到一封邮件 / 一条通知，仓库里出现一个叫
**「Panel rebuild failed」** 的 Issue，里面直接贴了报错的最后几十行。
两种错占了九成：

1. **JSON 语法** — 少一个逗号、多一个逗号、中文引号“”混进了英文引号 `"` 的位置。
   报错长这样：`SyntaxError: Unexpected token ... in JSON`，后面跟行号。
2. **文字太长** — 报错会明说：`work/context-distiller: "why" needs 7 lines on mobile, budget is 6`，
   后面还跟着被砍掉的那半句原文。
3. **作品卡跑偏了** — 报错长这样：
   `SELECTED WORK has gone stale: a project 1d old is not displayed, while a displayed one is 230d old`。
   意思是：有个项目比页面上某张卡活跃得多，但一直没被选上。通常有两种情况——
   新项目没加进 `projects`，或者在位那张卡被保护得太死（`hysteresisDays` 太大、
   或者 `coreLeadDays` 给得太多）。去 `projects` 里补一条，或者把这两个值调小。

修法：回到 `config.json` 再编辑一次改掉；或者在仓库的 Commits 里找到那次提交，
点 **Revert** 撤回。修好后机器人自己重跑，Issue 可以手动关掉。

> 只有**你自己改文件**触发的失败才会开 Issue。每 6 小时那次定时跑挂了不开——
> 通常是 GitHub 接口抖了一下，下一轮自己就好了。
>
> 上面第 3 条（作品卡跑偏）走的是同一套：定时跑时它只会在 Actions 里标红、不打扰你。
> 所以如果连着几天觉得卡片不对劲，值得去 Actions 页面看一眼日志里有没有
> `SELECTED WORK is lagging`。

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
