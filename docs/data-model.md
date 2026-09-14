# 数据与审核约定

发布目录 schema_version=1。version 用于防止把旧审核补丁应用到新目录。

## 泛式档案 CSV 数据

当前发布目录以 `上传作品信息.csv` 为完整来源，共 589 行、206 个作品 ID、32 个 BV 号。`scripts/import_archive_csv.py` 逐行核对起止链接、剪辑时间、分 P 和作品 ID，发生重复或冲突时停止。`provenance` 记录文件 SHA-256 与行数，`source.row` 为包含表头的原文件行号。

作品 `name`、`quarter` 以 CSV 为准；季度 `999999` 显示未定档，不转换成播出日期。Bangumi 按相同 ID 补充元数据，type=6 为真人／特摄，type=0 为元数据未取得。投稿时间使用 `published_date/published_at`，`live_date=null`，不推算直播日期。

片段 `kind=indexed` 仅表示作品片段，不由节目标题猜测讨论、观看或 PV 类别。`targets.seconds/end_seconds` 保留小数秒；`p` 来自原录播分 P。CSV 未提供 CID 与完整时长，因此使用 null，page.verification=csv-linked，并只对 archive-csv 来源放行此模式。正常笔记的 CID 与时长仍按原规则校验。“遮挡”和“上传p数”只属于视频制作流程，不导入网站目录。

下面的笔记模型与采集流程继续用于历史快照、候选和审核。

- subjects：以 Bangumi 数字 ID 为主键；name、original_name、aliases 用于搜索，air_date、image、summary 为缓存元数据。
- videos：BV 号、直播日期、投稿日期分开；pages 保存 CID、P 序号、名称和时长。不能按全部 P 相加推算录播长度，因为可能含弹幕版。
- segments：稳定 id、BV 号、笔记话题短摘录、subject_ids（支持多作品）、kind、review、source、targets。
- targets：同一话题的普通版/弹幕版目标；每个目标保留 CID、P、秒数。只有分 P 去除弹幕版后名称相同、时长相同、秒数相同、标题相同才合并。
- source：笔记 CV 号、作者、公开笔记链接及发布时间。
- review：pending 或 text-reviewed；playback_verified 独立记录，当前首批均为 false。
- kind：discussion、watch、pv、general、life（聊生活）、new_video（聊新视频）。后两者必须为空 subject_ids，仅保留整期时间轴，不进入作品索引。未确定作品的时点保留为空 subject_ids，在整期时间轴与审核工作台显示。

解析优先使用公开笔记的 Quill insert.tag（CID、index、seconds、status）。非原生文本支持 hh:mm:ss、mm:ss、P#hh:mm:ss；多 P 且未指定分 P 时标为问题，不猜测。首个非空文本行作为短话题，后续 PS 不作为新增动画讨论。

校验在构建前执行：作品关联必须存在、时点 ID 不重复、目标 CID/P 必须属于当前视频、秒数在范围内。已失效的来源标签不得发布成可点击目标。

## 更新流程

公开收藏夹 → 最新录播 → 视频详情/公开笔记列表 → 公开笔记专用正文 → candidate.json → 人工审核 → catalog.json → 测试 → GitHub Pages。

专用正文接口 `/x/note/publish/info?cvid=…` 在本轮最新三期全部成功。此前首轮报告中的正文限流是 `/x/article/view` 的结果；不是公开笔记专用接口无法获取的证明。两种结果应分开记录，专用接口也不保证永久或无限量可用。

收集器只接受公开数据，不使用用户凭据；失败写入 candidate-partial.json 后抛错，不把部分结果静默覆盖已审核目录。GitHub 手动采集工作流只保存候选 artifact。

## 多类型作品与审核补丁

subjects.type 使用 Bangumi 类型：1=书籍、2=动画、4=游戏。旧记录缺省 type 按动画兼容。书籍 platform 含“小说”或“漫画”时分别分类，否则归其他书籍。工作台名称识别只提示候选，关联仍由整理者核对版本。

补丁可带 subjects 数组，只新增经核对且有关联时点的作品；不能覆盖现有 ID。changes 仍支持多作品 subject_ids。新增作品与时点修改一起校验、原子应用，目录 version 同时计算作品和时点内容。旧版无 subjects 的补丁仍可使用。

Bangumi 接口依据：[官方 OpenAPI](https://github.com/bangumi/api/blob/master/open-api/v0.yaml)。工作台 POST /v0/search/subjects 搜索，GET /v0/subjects/{id} 获取详情及别名。
