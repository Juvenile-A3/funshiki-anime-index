# 数据与审核约定

发布目录 schema_version=1。version 用于防止把旧审核补丁应用到新目录。

- subjects：以 Bangumi 数字 ID 为主键；name、original_name、aliases 用于搜索，air_date、image、summary 为缓存元数据。
- videos：BV 号、直播日期、投稿日期分开；pages 保存 CID、P 序号、名称和时长。不能按全部 P 相加推算录播长度，因为可能含弹幕版。
- segments：稳定 id、BV 号、笔记话题短摘录、subject_ids（支持多作品）、kind、review、source、targets。
- targets：同一话题的普通版/弹幕版目标；每个目标保留 CID、P、秒数。只有分 P 去除弹幕版后名称相同、时长相同、秒数相同、标题相同才合并。
- source：笔记 CV 号、作者、公开笔记链接及发布时间。
- review：pending 或 text-reviewed；playback_verified 独立记录，当前首批均为 false。
- kind：discussion、watch、pv、general。未确定动画的时点保留为空 subject_ids，在整期时间轴与审核工作台显示。

解析优先使用公开笔记的 Quill insert.tag（CID、index、seconds、status）。非原生文本支持 hh:mm:ss、mm:ss、P#hh:mm:ss；多 P 且未指定分 P 时标为问题，不猜测。首个非空文本行作为短话题，后续 PS 不作为新增动画讨论。

校验在构建前执行：动画关联必须存在、时点 ID 不重复、目标 CID/P 必须属于当前视频、秒数在范围内。已失效的来源标签不得发布成可点击目标。

## 更新流程

公开收藏夹 → 最新录播 → 视频详情/公开笔记列表 → 公开笔记专用正文 → candidate.json → 人工审核 → catalog.json → 测试 → GitHub Pages。

专用正文接口 `/x/note/publish/info?cvid=…` 在本轮最新三期全部成功。此前首轮报告中的正文限流是 `/x/article/view` 的结果；不是公开笔记专用接口无法获取的证明。两种结果应分开记录，专用接口也不保证永久或无限量可用。

收集器只接受公开数据，不使用用户凭据；失败写入 candidate-partial.json 后抛错，不把部分结果静默覆盖已审核目录。GitHub 手动采集工作流只保存候选 artifact。
