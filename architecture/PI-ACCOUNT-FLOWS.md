> 2026-11-04 更新：本文下方为旧设计。用户最新明确要求 Pi 通过 CLI 创建账号并接收账号密码和 UID；实际实现已改为 account-auth.mjs + pi-account-setup.mjs。以 README 的 Pi 创建账号入口为准，旧文中的禁止 Pi 接收密码及逐次审批不再适用于这条已明确授权的测试流程。

# 四条 Pi 工作流（本地开发，真实闭环未验证）
最新授权允许Pi请求Macaron白名单操作，取代先前“Pi一律不接触Macaron操作”的架构限制。但模型仍不得获得密码、API key、bearer token或通用shell能力。

1. 注册：前端提交注册意图→后端创建逐次批准/安全凭据交接→固定注册执行器→核对账号与chat归属→绑定独立会话。Pi只能request_register_handoff，不接收密码。现有CLI只支持明文--data argv，安全执行器尚未实现；旧未知注册禁止重试。
2. 登录：同样使用request_login_handoff。用户密码经专用安全UI交给后端，不能发给Pi。skill明确admin登录不是普通用户登录；缓存/users/login仍需核实当前app端协议及响应。不得由UID伪造身份。
3. 账号聊天：Pi工具白名单status/history/send；backend sid由已认证HTTP会话绑定，模型不得传sid/UID/token/URL。只使用当前账号自己的token，先核对/chats/self。实际发送需对应授权；未授权时不能仅因schema存在就执行。前端HttpOnly cookie、CSRF/Origin、失效清理仍需完整接线。
4. 课程生成：独立Pi session，只加载用户明确指定且审核过的课程Skill；需要Skill名称和准确路径（尚未提供）。必要课程资料由后台筛选，不继承Macaron token/用户历史/其他Pi会话。返回候选字段和TSX，由后台校验、staging、审阅后发布；不自动执行生成代码或安装依赖。

每任务独立piSessionId，每浏览器独立后端session，记录flow与绑定；退出取消进行中任务并丢弃迟到结果。不同工作流不得复用Pi历史；共享同一模型不等于共享会话。

本轮代码：account-broker.mjs为后端隔离核心，独立内存会话、短期过期、并发拒绝、身份核对、退出abort及结果白名单；无上游默认不可认证。approval对象仅作后端内部契约，不能直接把客户端JSON作为批准证明。architecture/pi-workflows.mjs仅产生四流隔离计划，executionEnabled=false。没有新增可接收真实密码的HTTP入口。

Pi最新 macaron/glm-5.2 返回OK来自用户/父线程提供的已授权验证结果，本轮未重跑或读取会话日志；仅证明那次模型可响应，不证明CLI联动、账号流程或Skill生成完成。

视觉：原Figma气泡Demo完整保留在/bubble-demo；尚未把真实注册/登录接进该原页面，/chat简化页不能算完成。

模拟验证：账号隔离、禁止UID覆盖、脱敏、退出后迟到登录不复活；四流Pi session唯一、课程无账号操作、未指定Skill拒绝。真实注册/登录/聊天/生成均未执行。

下一步需要：课程Skill名称和路径；安全普通用户登录接口确认；若做真实认证须明确账号、Alpha接收方、此次目的和凭据交接方式并逐次批准。当前测试UID仅保留既有只读历史授权，不据此发消息。不在聊天索取任何Key或密码。
