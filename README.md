# 泛式杂谈索引

[访问网站](https://Juvenile-A3.github.io/funshiki-anime-index/) · [GitHub 仓库](https://github.com/Juvenile-A3/funshiki-anime-index)

从动画出发，找到泛式谈及作品的录播和时点。非官方粉丝项目，动画数据来自 Bangumi，时间轴来自录播下的公开笔记。

首版：21 部动画、3 期录播、57 个话题、25 个动画关联时点、96 个普通版/弹幕版跳转目标。录播日期为 2026-06-20、2026-06-27、2026-07-04，以录播组收藏夹当前最新三期为范围。

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
4. 运行 `Test and deploy Pages` 工作流。通过检查后仅上传 dist 目录，站点地址通常为 `https://账号.github.io/funshiki-anime-index/`。

也可在已登录 GitHub CLI 的环境执行：

```sh
gh repo create funshiki-anime-index --public --source . --remote origin --push
# 将 OWNER 替换为当前账号
gh api --method POST repos/OWNER/funshiki-anime-index/pages -f build_type=workflow
gh workflow run pages.yml
```

首次推送可能先于 Pages 配置完成，届时在启用 Pages 后重新运行工作流。Pull Request 只检查，不部署。HTML、CSS、模块和 JSON 都通过相对路径加载；路由用 URL hash，兼容项目子目录及页面刷新。

## 页面功能

- 动画名称、日文名、别名和已关联笔记关键词搜索；年份过滤及排序。
- 动画详情按直播日期汇集时点，保留笔记作者和来源。
- 整期时间轴同时保留未归类话题；普通版与弹幕版合并展示。
- 选择提前 5 秒进入上下文。
- 整理工作台保存浏览器本地草稿、导出 JSON 补丁；不会直接发布修改。

## 数据与审核

`data/catalog.json` 是可发布的已整理目录。普通笔记原文、接口完整响应和第三方源码不随站点部署，也已在 .gitignore 中排除。

```sh
# 只采集候选，不修改发布目录；默认最近三期，每个请求至少间隔三秒
python scripts/collect_latest.py --limit 3

# 审核浏览器导出的补丁后，再在本地应用
python scripts/apply_review.py path/to/funshiki-review-patch.json
npm run check
git diff -- data/catalog.json
```

手动运行 GitHub Actions 的 `Collect latest public notes (review required)`，会把候选文件保存为 artifact，不会自动改动目录或触发部署。云端 B 站连通性与限流情况尚待首次运行验证。遇 -509 等限制即停止，不读取或上传账号 Cookie。

新动画：从 Bangumi 核实 ID、名称、别名和季数，在目录 subjects 中新增；再关联 segments。工作台当前可选已有动画，新条目可先把 ID 和依据写入说明，再由维护者补充。`config/mapping-rules.json` 和 `scripts/make_catalog.py` 仅用于本次首批种子构建，不应拿来自动批准未来采集，也不要在已有人工修改后无意重建覆盖目录。

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

感谢笔记作者「逆命者之矛」、[下播型泛式录播组](https://space.bilibili.com/281341996/favlist)、[Bangumi](https://bgm.tv/)、[PiliPlus](https://github.com/bggRGjQaUbCoE/PiliPlus)。本项目以链接和必要短摘录建立索引，不托管录播视频。动画图片与笔记内容保留各自来源权利。
