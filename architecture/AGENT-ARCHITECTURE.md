# 统一后台与三个职责边界（提案，未接通）

2026-11-03。只读检查现有源码后形成；未执行登录、消息发送、外部生成或线上修改。此文档不是新增外部操作授权。

## 目标

浏览器 → 本机统一后台 → 三个独立适配器：
- Worker：外部文本/代码模型，只接收任务目标、经过筛选的材料、版本化系统提示词与允许的skill。生成大纲/课件数据/TSX候选产物。不持有Macaron token，不直接查询用户历史。
- Realtime：实时教学、受限课堂工具、一次挂断总结。仅经后台请求Worker任务或上下文；不直接调用Macaron。
- Macaron：经过认证的当前账号、聊天历史、记忆与偏好、通话后总结回写。不是TSX生成器。口述Mattermost暂理解为Macaron，禁止因此连接新产品。

## 当前差异与拟修改范围

1. server.mjs 已有本机代理、配置版本、离线状态。尚无统一账号→通话→Worker任务映射、生命周期与权限编排。
2. macaron-app-adapter.mjs 有用户token绑定、/chats/self匹配chat_id、SSE聊天。没有可用的真实登录入口；token为内存且尚无完整过期刷新。特定账号历史读取脚本不是多账号生产认证方案。
3. /api/generate 仍返回模拟结果；generate_lesson_content 的Macaron模拟命名与新职责不一致。后续改为 request_worker_task，但本轮不改已运行工具。
4. /api/summary 仅本机保存文本，没有发送Macaron。现有随机request_id不能确保未知结果重试不重复；同步前必须补幂等任务记录与结果核查。
5. TSX当前是开发者构建的可信组件，同源运行、并非可安全运行任意模型代码的沙箱。新Worker产物不得自动放入现有同源iframe。
6. Realtime已有布局查询、按ID圈画、页版本验证；外部材料放user消息，不拼入instructions。保留这些边界、隐藏字幕、关闭输入转写与一次挂断总结。

## 通话前流程

用户点击准备通话 → 后台冻结 accountBindingId → 核验当前登录态与chat归属 → 按该账号读取获准范围的历史/偏好 → 生成ContextBundle → 用户可见准备状态 → 建立Realtime → 注入资料消息并确认成功 → 请求开场。

待决： “请求Macaron获取并总结”是否意味着发送一条聊天消息给Macaron以生成摘要？若是，它有写入历史、生成费用与额外延迟，不能包装成只读查询。现有skill未证明独立的只读摘要/偏好API。也可只读历史后由Worker总结，但这改变职责及会将私密材料发给外部模型，须另行决定授权范围。未决时不得自动执行任一路径。

准备失败时明确失败/重试/用户选择无上下文继续，不伪造摘要、不跨账号补资料。连接前不录麦克风；资料标记来源、时间、选取范围、摘要不确定性，不把推断写成用户事实。

## 通话后流程

正常挂断停止麦克风 → 原会话只请求一次文本总结 → 本机保存成功后关闭 → 后台待同步队列 → 按通话开始时冻结账号回写Macaron，绝不使用此时可能已切换的账号。
立即挂断/超时：不补做隐藏模型调用，标记没有完整总结；如只收到片段不得标记完整。同步有queued/sending/succeeded/failed/unknown；未知结果先查证，不自动重发。未来真实发送需明确目的、目标账号和此次授权；默认可先预览批准。不能声称发送聊天自动等于已持久保存记忆或偏好。

## Worker任务与产物

POST /api/worker/jobs：只接受结构化goal、courseId、expectedVersion、skillIds、材料引用与预算限制。后台决定provider、model、promptVersion；浏览器/模型不得指定任意URL、命令、路径或密钥。
GET job状态：queued/running/awaiting_review/succeeded/failed/cancelled/unknown，带超时、错误分类及真实产物引用。
产物先写隔离staging（当前用户权限），校验JSON schema、长度、路径和依赖白名单；由人工审阅后显式发布。TSX静态检查不能证明安全：预览需独立opaque origin、无同源权限、禁网络与凭据，构建亦需受限工作目录及资源上限。禁止自动npm安装、postinstall、shell、任意文件访问。
优先返回结构化字段补丁，只有新布局才生成TSX。发布需expectedVersion匹配，保留历史及回滚；失败不替换当前课件。

## Realtime与后台异步交接

request_worker_task → 后台返回jobId与accepted（非完成），通过原call_id的function_call_output回传并结束本次调用。完成后后台只向仍匹配的call/account/course版本发送明确标注的任务结果上下文；若原调用保持等待则只回传一次最终function_call_output，不能对同一call_id重复输出。断线任务结果留本机，不注入其他会话。模型不决定审批、权限与发布。

## 密钥和数据隔离

三个独立凭据域：OpenAI服务密钥、外部Worker密钥、用户Macaron token。仅后台读取；浏览器拿随机HttpOnly会话标识，模型/skill看不到凭据。provider endpoint由后台白名单绑定，TLS校验开启，重定向拒绝；日志仅ID/状态/耗时，剔除密码、token、原文及代码中的秘密。
本机回环不是身份边界；后续须加强本地会话认证、CSRF与跨账号授权。Worker默认不接触用户原始历史；最小必要材料外发需独立授权。分享包继续排除private/data/录音/聊天。

## 待决项与下一步

- 外部Worker服务商、官方协议、模型及预算；未给出，不猜接口，不在聊天索取Key。将来通过本机权限受限配置文件设置。
- Macaron普通用户登录/刷新协议及可用环境；不能用UID当认证。
- 通话前摘要由谁生成、是否写入Macaron历史、哪些材料允许发Worker。
- 通话后总结发送的用户确认方式、可验证幂等机制与未知结果核查。
- skill来源与审核范围、候选TSX是否允许本机编译预览、产物保留周期。

本轮交付仅设计和TypeScript接口，无外部执行能力。后续先实现本地假上游编排测试，再在对应授权及安全认证完备后逐项真实接通。
