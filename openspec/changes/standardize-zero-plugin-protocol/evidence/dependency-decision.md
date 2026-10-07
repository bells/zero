# 协议依赖与跨语言规则

2026-09-27 实际 npm registry 查询：

| 依赖 | 选择 | 许可证 / 维护 / 成本 |
| --- | --- | --- |
| npm semver | 精确 7.8.5，运行时显式依赖 | ISC；registry modified 2026-09-09；unpacked 101065 bytes。替代传递 semver 6，最终 bundle 增量另测。 |
| @types/semver | 精确 7.7.1 | 开发期类型，不加入运行时代码。 |
| Ajv | 精确 8.20.0，devDependency | MIT；registry modified 2026-04-24；unpacked 1033496 bytes。只用于离线工具/共享 fixtures，不将 validator 编译器塞入启动 bundle。 |
| Rust semver | 精确 1.0.28 | MIT OR Apache-2.0；本机 registry/原 Cargo.lock 已有该版本，新建直接依赖不新增解析库副本。此次未查询 crates.io 最新发布日期，不将缓存状态当最新证明。 |
| Rust Schema runtime | 保持 serde + deny_unknown_fields 与显式语义验证 | 暂不新增 jsonschema crate。用相同 corpus 验证与 Ajv 一致性；Schema 与 DTO 的变更必须共同通过 fixtures。 |

库负责版本解析、优先级和 prerelease 匹配；小型 grammar guard 只负责范围子集、完整数字与上界要求。Rust Comparator 裸版本默认不是 npm exact，入口统一显式 `=`；npm valid 会接受 v 前缀和部分空白，入口主动拒绝。两端显式保留 build metadata 比较语义。

共享 corpus：`tests/fixtures/plugin-protocol/{versions,manifests,requests}.json`。首轮 Rust manifest corpus 揭示 Option/null 与 Schema 的差异，已加显式拒绝并保留回归样例。Rust serde Option 输出是否为 null 由具体契约决定，不能全局应用 rename 或 skip 规则。
