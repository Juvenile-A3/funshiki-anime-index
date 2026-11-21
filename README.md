# 诶嘿漫谈部

[访问网站](https://funshiki-anime-index.cn/) · 非官方粉丝项目

从作品出发，寻找泛式动漫杂谈的相关切片，也可以按录播浏览和搜索。本站只提供索引，点击片段会跳转到B站原视频。

11 月 22 日更新后共收录 275 部作品、54 期录播和 883 个切片，192 部作品可从详情页直达 B 站合集。[查看网站更新说明](https://funshiki-anime-index.cn/#/about)

## 本地运行

需要 Node.js 22+，无需安装额外 npm 依赖。

Windows 下双击项目根目录的 `启动网页预览.cmd`，会重新构建发布版并自动打开浏览器。默认地址为 http://127.0.0.1:4180 ，占用时自动尝试 4181–4193，以启动窗口显示的地址为准。该范围避开整理台及早期手机版的本地入口，防止浏览器沿用那些地址的离线页面。请使用启动脚本打开的新地址，不要沿用旧的 4173–4175 预览书签。

保持启动窗口开启；关闭窗口或按 Ctrl+C 停止。修改网页后重新运行。预览直接读取与 GitHub Pages 相同构建流程生成的 `dist/`。

```sh
npm run preview
```

运行 `npm run check` 检查并构建网站，输出目录为 `dist/`。主分支通过 GitHub Actions 部署到 GitHub Pages。

## 数据与致谢

感谢泛式、[下播型泛式录播组](https://space.bilibili.com/281341996)、[泛式档案](https://space.bilibili.com/1463485213)与录播视频的轴man，以及 [Bangumi](https://bgm.tv/) 的条目维护者们。

片段索引来自公开整理，作品资料参考 Bangumi。视频、图片及原始整理内容的权利归各自权利人。

## 反馈

发现时轴、作品关联或链接错误，欢迎提交 [Issue](https://github.com/Juvenile-A3/funshiki-anime-index/issues)，或联系[作者B站](https://space.bilibili.com/412633250)。
