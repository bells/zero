# Waline 许可核查与采用方式（2026-10-17）

用户选择“先核清 Waline 许可，再继续接入”后完成此轮核对。结论是**按上游 GPL v2 明确授权保守采用服务端，不把包的 MIT 元数据作为 MIT-only 或双重许可依据**。元数据差异仍然存在，也没有声称得到维护者新授权；它不再作为禁止本地 GPL 兼容接入的理由。

## 官方证据

1. 固定发布提交 [`c4b0f1e` 的 README](https://github.com/walinejs/waline/blob/c4b0f1ebb9a7970d36493d4c3580f3f43e098fa5/README.md#license) 明确标注 GPL-2.0，根 [LICENSE](https://github.com/walinejs/waline/blob/c4b0f1ebb9a7970d36493d4c3580f3f43e098fa5/LICENSE) 与已校验 tarball 完全相同。
2. [根 LICENSE 的官方提交历史](https://api.github.com/repos/walinejs/waline/commits?path=LICENSE&per_page=10) 仅列出 2020-11-08 和 2020-12-06 的变更；不是调查当天才出现的临时改动。
3. [客户端单独 LICENSE](https://github.com/walinejs/waline/blob/c4b0f1ebb9a7970d36493d4c3580f3f43e098fa5/packages/client/LICENSE) 确为 MIT，具独立版权声明；固定提交树中没有相应的 `packages/server/LICENSE` 或 `packages/core/LICENSE` 来替换根 GPL。不能把客户端 MIT 自动套到服务端。
4. npm/package.json 的 MIT 与上述资料冲突。GitHub issues/PR 检索 `license in:title` 返回 0 项；`GPL in:title,body` 返回的 1 项是无关的 MySQL 故障，没有查到维护者对本差异的解释。此检索不覆盖所有历史 discussion，也不证明不存在其他解释。没有向维护者发消息或创建 issue。
5. [GNU 官方 GPL v2 FAQ 的网站服务条目](https://www.gnu.org/licenses/old-licenses/gpl-2.0-faq.html#UnreleasedMods) 说明，仅通过网站提供修改版服务本身不要求公开服务端修改源码；再分发软件副本是另一种情况。[独立程序条目](https://www.gnu.org/licenses/old-licenses/gpl-2.0-faq.html#GPLInProprietarySystem) 强调需要实质独立，不能仅靠目录名或网络传输宣称许可隔离。

## 本项目的具体处理

- 独立 `feedback/` 工程按 GPL-2.0-only 提供新增适配服务源码，保留上游完整 LICENSE 和来源/版本/修改说明；不是把现有桌面和网站目录改为 GPL。
- 网站只嵌入独立文档，以最小 ready/resize/error 消息协调显示；不把 Waline 客户端或服务端代码编进主站/桌面，不构造共享的内部业务运行时。
- 服务端只导入 `@waline/vercel@1.43.4` tarball 自带的官方 core。`@waline/core@0.1.0` 的独立 npm 查询为 404，不能伪造一个可安装的独立发布版本。使用完整固定包并承担其隔离依赖体积，而非自行重新发布 core 或移除许可证。
- 默认 ThinkJS server 不启动，原生 HTTP 路由不自动挂载；公开和受保护管理 facade 继续复用 core 的认证/审核/导出。没有维护 Waline fork 或新造用户认证体系。
- 未来若分发该服务或容器，须同时提供对应完整源码、构建方式、锁文件、变更和许可通知；不能只发二进制。新增客户端自身为 GPL 兼容源码；传递依赖保留各自许可。尚未完成全传递依赖/最终发行物审计，不能据此宣布可发布。
- 云账号、免费资格、托管服务和生产发布仍按任务 7 单独核验，不因许可处理而自动部署。

这是一项依据上游明确 GPL 文件作出的保守工程采用决策，不是对元数据差异成因的推测，也不是关于任意组合/部署/分发方式均合规的法律保证。下一步恢复技术候选门禁 1.2/1.3。
