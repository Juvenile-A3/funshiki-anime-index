# 泛式杂谈索引

[访问网站](https://funshiki-anime-index.cn/) · [GitHub 仓库](https://github.com/Juvenile-A3/funshiki-anime-index)

从作品出发，找到泛式谈及它的录播片段。非官方粉丝项目，片段数据来自用户提供的「泛式档案」整理 CSV，原名、别名、封面和类型按作品 ID 从 Bangumi 补充。

当前：206 部作品、32 个录播视频、589 条片段，录播投稿日期从 2026-03-08 至 2026-09-06。作品名称、季度、起止时间及原录播分 P 以《上传作品信息.csv》为准。原表“遮挡”“上传p数”是视频制作信息，不进入网站。首批公开笔记数据保存在 `tests/fixtures/seed-catalog.json`，不随站点发布。

CSV 导入：`python scripts/import_archive_csv.py --fetch-metadata`。元数据缓存保存于 `data/raw/archive-metadata.json`；缓存已有时可省略参数离线导入。导入会用整份 CSV 替换发布目录，应在更新原表并检查现有审核修改后运行。构建不发起网络请求。

## 本地运行

需要 Node.js 22+，采集与 Python 测试需要 Python 3.12+。站点运行和构建无第三方包依赖，无需 npm install。

```sh
npm run dev
# 打开 http://127.0.0.1:4173
npm run check
npm run build
```

## GitHub Pages

1. 创建仓库 `funshiki-anime-index`。如使用 GitHub Free 的 Pages，选择公开仓库；请先检查要公开的文件。
2. 在 `config/site.json` 的 repository 填入 `账号/仓库名`。
3. 推送 main 分支。仓库 Settings → Pages → Build and deployment → Source 选择 GitHub Actions。
4. 运行 `Test and deploy Pages` 工作流。通过检查后仅上传 dist 目录，默认地址为 `https://账号.github.io/funshiki-anime-index/`；本仓库已通过根目录 `CNAME` 配置自定义域名 `https://funshiki-anime-index.cn/`，构建时会将它复制进 Pages artifact。

也可在已登录 GitHub CLI 的环境执行：

```sh
gh repo create funshiki-anime-index --public --source . --remote origin --push
# 将 OWNER 替换为当前账号
gh api --method POST repos/OWNER/funshiki-anime-index/pages -f build_type=workflow
gh workflow run pages.yml
```

首次推送可能先于 Pages 配置完成，届时在启用 Pages 后重新运行工作流。Pull Request 只检查，不部署。HTML、CSS、模块和 JSON 都通过相对路径加载；路由用 URL hash，兼容项目子目录及页面刷新。

## 页面功能

- 作品名称、原名、别名、ID 搜索；动画、书籍、游戏、真人／特摄等分类，年份和季度筛选。
- 作品详情按录播投稿日期汇集片段，保留「泛式档案」署名与原表行号。
- 录播时间轴按原录播分 P、起点排序，保留起止小数秒；支持跳到结束。
- 选择提前 5 秒进入上下文。
- 整理工作台保存浏览器本地草稿、导出 JSON 补丁；不会直接发布修改。

## 数据与审核

`data/catalog.json` 是可发布的已整理目录。CSV 原文件在仓库保留用于追溯，构建仅发布目录 JSON 和站点文件。普通笔记原文、接口完整响应和第三方源码不随站点部署，也已在 .gitignore 中排除。下面是仍可使用的公开笔记候选采集流程，与当前 CSV 导入独立。

```sh
# 只采集候选，不修改发布目录；默认最近三期，每个请求至少间隔三秒
python scripts/collect_latest.py --limit 3

# 审核浏览器导出的补丁后，再在本地应用
python scripts/apply_review.py path/to/funshiki-review-patch.json
npm run check
git diff -- data/catalog.json
```

手动运行 GitHub Actions 的 `Collect latest public notes (review required)`，会把候选文件保存为 artifact，不会自动改动目录或触发部署。云端 B 站连通性与限流情况尚待首次运行验证。遇 -509 等限制即停止，不读取或上传账号 Cookie。

整理工作台支持按名称／别名识别已有作品，在线搜索 Bangumi 的动画、书籍和游戏，核对后关联一个或多个作品。新作品的名称、别名、类型、封面等元数据随 JSON 补丁导出，应用补丁时一并入库。书籍依据 Bangumi platform 区分小说、漫画；未知细分类别保留为其他书籍，不猜测。搜索并行合并 Bangumi 旧版搜索、新版名称搜索及社区标签，以原始关键词检索并按 ID 去重，不维护作品专属简称映射。旧版独有结果会读取详情以区分小说、漫画。搜索需能连接 api.bgm.tv，支持分页、超时和失败重试，无需登录。

“聊生活”“聊新视频”保存为空作品关联，不进入作品索引与作品统计，保留在整期时间轴；在工作台“全部话题（含已分类）”可再次修改。草稿不等于已发布内容，仍需应用补丁、检查并发布。

`config/mapping-rules.json` 和 `scripts/make_catalog.py` 仅用于本次首批种子构建，不应拿来自动批准未来采集，也不要在已有人工修改后无意重建覆盖目录。

## 目录

```text
site/                    静态网页、样式和前端逻辑
data/catalog.json        发布目录（可追溯的短话题摘录）
config/                  站点、数据来源、种子映射规则
scripts/collect_latest.py 公开笔记采集
scripts/apply_review.py   审核补丁校验与应用
scripts/build.mjs         白名单复制构建
scripts/serve.mjs         仅本机回环地址的预览服务
tests/                   查询、时点、合并、解析和审核测试
.github/workflows/       检查、发布、手动候选采集
```

数据结构见 [docs/data-model.md](docs/data-model.md)，首版验证记录见 [docs/validation.md](docs/validation.md)。

## 数据边界与致谢

“条目已核对”只表示对照笔记和 Bangumi 做过文本匹配；不是逐段听看后的观点认证。纯文字简称仍可能需要人工确认。笔记里的未来计划、粉丝评分清单、二创鉴赏不能都当成主播对作品的评价。时间标签已检查 CID、P 和范围，但视频重传仍可能使链接失效。

感谢「泛式档案」提供作品片段整理数据，以及此前笔记作者「逆命者之矛」、[下播型泛式录播组](https://space.bilibili.com/281341996/favlist)、[Bangumi](https://bgm.tv/)、[PiliPlus](https://github.com/bggRGjQaUbCoE/PiliPlus)。本项目以链接建立索引，不托管录播视频。图片与整理内容保留各自来源权利。
