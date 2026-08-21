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
| `work` | 03 的六张作品卡（详见下面第四节） |
| `contact` | 07 的联系方式按钮，`enabled: false` 就是关掉不显示 |
| `fortunes` | 08 每天换一句的那句话，往数组里加就行，加多少都可以 |
| `quote` / `tiles` / `display` | 主页上**没有**用，只出现在 `docs/COMPONENTS.md` 里当样例 |
| `motion` | 每个模块的动画开关。整页静止就把 `enabled` 改成 `false` |
| `activity.days` / `activity.limit` | 「最近动态」看多久以内、最多列几条 |
| `languageScope.repos` | 语言占比统计哪几个仓库 |

**这些不用你管，它们自己会变**：作息热力图、语言占比、最近星标、最近动态、
一年的贡献图、每日一句。这六块每 6 小时按真实数据重画一次。

---

## 四、作品卡（唯一有长度上限的地方）

`work` 数组里每一项：

```json
{
  "key": "context-distiller",
  "num": "01",
  "name": "Context Distiller",
  "why": "为什么这个东西存在——一到两句。",
  "tags": ["TypeScript", "React 19", "WXT", "Manifest V3"],
  "url": "https://github.com/yunmin311/context-distiller"
}
```

- `key` 是文件名，改了它，README 里那张图的路径也要跟着改。**不想改路径就别动 `key`。**
- 六张卡等高，这是它们看起来像一整块而不是六张海报的原因。所以 `why` 有硬上限：
  **英文约 180 个字符以内是安全的**（桌面 4 行 × 每行 53 字，手机 6 行 × 每行 36 字）。
  超了不会被悄悄截断——构建会直接失败，并在报错里告诉你多了几行、被砍掉的是哪几个字。
- `tags` 最多两行，四个短词是舒服的量。

顺序 = 卡片在页面上的顺序，目前和 GitHub 上 pin 的六个仓库一致。

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

修法：回到 `config.json` 再编辑一次改掉；或者在仓库的 Commits 里找到那次提交，
点 **Revert** 撤回。修好后机器人自己重跑，Issue 可以手动关掉。

> 只有**你自己改文件**触发的失败才会开 Issue。每 6 小时那次定时跑挂了不开——
> 通常是 GitHub 接口抖了一下，下一轮自己就好了。

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
