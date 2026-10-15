# 项目约定

本项目是 `SKILL.md` 驱动的 Codex Skill，没有独立应用、构建服务或 API。运行行为主要由提示词、参考文件和 UI 调用提示共同决定。

- `SKILL.md`：任务路由、默认行为、输入输出和单平台更新范围。
- `references/title-strategy.md`、`headline-formulas.md`、`search-intent.md`：标题创意、力度和关键词方法；`platforms.md` 与 `output.md` 管平台字段和交付格式。
- `examples/`：可阅读的创意示例，不是已发布成绩或独立效果测试；保留旧稿便于比较。
- `references/source-library.md`：实际访问过的研究来源与边界，更新具体记录，不统一刷新未复查来源的日期。
- `agents/openai.yaml`：界面简介与默认调用提示，应与 `SKILL.md` 的默认策略一致。
- `references/cover-design.md`：按需视频取材、账号视觉规范、双比例封面与缩略验收；`scripts/extract_cover_frames.py` 只抽帧，依赖环境已有的 FFmpeg / FFprobe，不生成成品封面。
- `assets/cover-system/` 与 `references/cover-system.md`：固定字体、品牌配置、HTML模板及定稿契约；`scripts/render_covers.mjs` 生成候选，`scripts/finalize_cover.mjs` 只按用户选择导出本地定稿。字体许可和指纹必须保留。

迭代优先验证真实输出：默认强传播表达、跨平台点击理由、搜索意图匹配和素材能否承接。不能仅通过字符数和字段齐全证明创意有效，也不使用自拟的爆款概率。

验证入口：环境有 `skill-creator` 时运行其 `scripts/quick_validate.py`；同时检查相对 Markdown 链接、样稿标题计数和至少一个非原示例题材。单平台修改要核对未请求字段保持原样。无需安装应用依赖。

封面流程变更还需核对普通标题任务不触发生图、只补封面不重写文案。抽帧脚本修改用本地合成视频验证取材和失败路径；合成素材不作为真实视频或封面成品交付。4:3 / 3:4 是项目交付约定，不是五平台通用的已核实上传规则。

固定模板脚本修改运行 `node scripts/test_cover_system.mjs --modules <已有依赖目录>`。不自动安装 Playwright 或浏览器；渲染失败报告保留，禁止用失败批次冒充成功。编辑主推、测试选择与用户真实选择分开，不自行定稿或发布。

修改应同步受影响的 README 和调用提示。没有发布数据不承诺传播结果；没有当前表单或官方依据不把内部字符目标改称平台硬限制。临时研究与验证文件放已忽略的 `.tmp/`，交付示例放 `examples/`。
