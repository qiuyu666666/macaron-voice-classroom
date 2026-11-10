# macaron-account-bridge 只读核查

已确认正式目录 ~/.pi/agent/skills/macaron-account-bridge/ 存在 SKILL.md、HANDOFF.md、scripts/chat_send.py、scripts/langfuse_fetch.py。本轮未执行脚本、CLI、认证或查询真实记录；潜在凭据字面量在输出前遮蔽，不复制脚本到分享项目。

实证：
- 注册仅为文档shell样例，执行macaron-dev-cli user create-user --data JSON；仍把密码置于argv。没有独立注册/登录Python实现。
- 返回约定为user_id/token/chat_id/refresh_token等蛇形字段。HANDOFF自述token实测约30天；代码未校验exp、未刷新、未提供登录实现，因此期限不是本轮验证结论。
- chat_send.py固定POST https://alpha-api.macaron.im/macaron/chat，Bearer用户token，message_data.message_content_list，SSE assistant_text_part.message拼接。只有执行脚本main或调用send才发请求；本轮均未执行。
- main从argv取消息/token/chat_id并打印回复。没有/chats/self身份核对、账号绑定、明确禁重定向、终态失败判定或CRLF兼容。不能直接作为安全前端执行器。
- Skill称过期可user login续期，但旧account-chat-flow明确该命令为管理端登录、普通账号失败。此冲突仍需正式普通用户登录实现解决。
- langfuse_fetch.py含PK/SK凭据常量，未输出值。list_traces先请求全量100条再按UID筛选；指定trace_id分支未核对UID归属并打印部分输入。不能纳入当前单账号授权读取链路，也不能默认给Pi/前端使用。
- HANDOFF承认不负责UI、token存储和业务编排；“UID+message”只是调用简写，真实认证仍依赖用户token。

可沿用：请求体/SSE字段与历史嵌套解析协议；项目现有MacaronAppAdapter已采用这些字段并额外做self核对、内存绑定、固定URL/拒重定向/错误脱敏。应复用安全内存传输，而非执行argv脚本。

最小阻塞：现有已授权测试账号没有安全获得的有效user token；bridge未补齐密码登录/刷新请求，不能凭UID认证。需正式普通用户登录实现，或用户经独立安全方式交接该账号有效token并明确此次用途。不得把token发到聊天/Pi，不运行未知旧注册、不借其他账号。

Pi报告的真实成功是外部自述，本轮只验证文件及代码机制，不据此宣称本前端已联通。
