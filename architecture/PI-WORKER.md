# Pi Worker 核查与最小适配（未启动模型）

实证（2026-11-03）：
- 可执行路径 /opt/homebrew/bin/pi；本机安装文档 /opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/README.md 与 docs/rpc.md。
- 文档明确：默认工具read/write/edit/bash；支持skills/extensions及provider扩展；PI_CODING_AGENT_DIR可隔离配置。扩展运行有完整系统访问，不能把独立cwd当作安全沙箱。
- rpc模式为stdin/stdout的LF分隔JSONL，prompt acceptance不等于生成完成；不能用会拆U+2028/U+2029的通用readline。未来必须解析agent终态、错误和实际产物后才报告成功。
- ~/.pi/agent/skills/macaron-account-chat-flow/SKILL.md包含Macaron CLI注册、用户token HTTP聊天说明。证明本机有集成说明，不证明任何当前Pi实例加载成功、账号有效、模型提供商可用或“接近线上”的质量结论。本轮未读models/auth配置、令牌、历史或账号资料，也没有启动Pi进程。

最小方案：后台每任务独立绑定账号上下文引用，但不给Worker Macaron凭据；单独PI_CODING_AGENT_DIR、受限cwd、环境白名单，不继承现有HOME配置/令牌/代理以外的秘密。具体网络配置需与选定provider安全方案配套，不修改系统代理。只开放已审核provider和model，凭据不在argv或prompt。

使用文档存在的 --mode rpc --no-session --no-tools --no-extensions --no-skills --no-prompt-templates --no-context-files；不自动加载Macaron skill或现有个人环境。初版仅生成结构化大纲/字段/TSX候选文本，后台验证并写staging，人工批准后发布。禁用工具并不防止模型生成危险代码；仍不得自动编译执行或同源运行未审核TSX。

课程skill应经审核后作为显式材料传入，不能直接加载包含shell能力的任意个人skill。未来需改用特定受限工具时重新评估，不开启通用bash/read。系统提示词版本需由后台解析为实际文本（当前plan仅传版本引用，是未完成接线），禁止让客户端选择文件路径。

architecture/pi-adapter.mjs目前仅产生启动计划、JSONL命令及解析器；默认submit拒绝执行，无spawn/network/文件写入。注入mock transport用于本地测试；2项测试通过（禁用真实执行/隔离flags、JSONL分块与Unicode分隔符）。未实现超时进程回收、终态聚合、输出审查及凭据注入，不能视为可用真实Worker。

待决：用户选择的模型provider/准确model/预算；是否已有独立Worker配置可用（不得擅自读取现有密钥）；通过本机受限文件或已批准凭据管理器设置Key，不发到聊天。确认后先实现纯本地假RPC进程测试，再按授权做最小真实验证。
