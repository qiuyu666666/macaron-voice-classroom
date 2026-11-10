# Realtime 学习课堂 · 桌面开发副本

## 登录、注册与切换账号（2026-11-04）

打开桌面的「Macaron 聊天」入口；未登录会先进入 `/accounts`。这里支持真实 Alpha 邮箱注册、密码登录、退出和已保存测试账号快捷登录。聊天右上角可切换账号。首次使用其他账号会创建独立 Pi 对话，切回后恢复自己的聊天、课件和总结。

「德语法语测试1」已创建真实 Alpha 身份，并绑定原本地聊天，原记录和备份保留。账号、密码和 UID 在 `private/accounts/德语法语测试1.json`；账号管理库在 `private/auth/accounts.json`。这些文件仅供本机测试，权限 600，禁止提交或分享。普通状态与账号列表不会返回密码或令牌；Pi 创建流程按用户要求返回账号密码用于填表，并交给对应 Pi 会话。

当前接入的是 Alpha 测试环境：注册通过已登录的本机管理身份创建普通用户；普通用户密码登录走 `/users/login`，再校验 `/chats/self`。登录前按邮箱精确核查已注册身份，避免把未知邮箱误当登录而注册。管理身份过期时需重新登录 `macaron-dev-cli`，页面会给出错误。没有接入找回密码、邮件验证或生产环境账号流程。

认证只确定身份，文字聊天仍走本机 Pi，语音仍可选 Live / Realtime。数据仍保存在本机，不代表已同步到 Macaron 云端聊天。服务端用 UID 选择本地会话；浏览器提交的旧 `pi_chat` 不再赋予访问权限。切换账号后，旧聊天页的发送会被拒绝，需刷新。请先结束通话并等待总结保存，再切换账号。

验证：真实创建一个 Alpha 测试用户；真实密码登录、UID 和聊天归属核查；浏览器快捷登录、退出、再次登录恢复原 47 条消息；56 项自动测试通过，含两账号隔离、旧会话失效、未知邮箱不注册、密码错误、身份不匹配和注册不确定结果不重复提交。

## 使用

双击 `start-console.command`，会打开 **http://127.0.0.1:4327/chat**。保持终端开启，Ctrl+C 停止。后台设置在 **http://127.0.0.1:4327/console**。启动器复用本机已启用的系统 HTTP 代理，仅设置本服务进程的环境，不改系统代理。

在聊天中提出学习目标。Pi 先给短文字和共享轻量教案，聊天立刻出现语音邀请；点击后先讲教案，完整 TSX 在后台继续生成。通过类型检查、构建和隔离页面试加载后，通知当前老师，由老师择机切换；用户也可点“知识脉络 / 互动课件”。切换不重连语音、不丢失课件交互进度。通话页复用聊天手机框、顶部时间与奶油白配色。正常结束点“结束通话”，总结回原 Pi 对话。

## 统一提示词后台

打开 http://127.0.0.1:4327/settings 。Pi 主聊天中的按钮规则、Worker TSX 生成规则、语音老师和自动注入消息均可编辑。页面逐项标明真实来源与生效时间；参考素材不会自动进入模型。主聊天保持 no-skills；Worker 加载 learning-outline 与 tsx-courseware，并使用 read/write/edit/bash/grep/find/ls。技能正文与引用可在后台编辑。

## 当前实际链路

- `/chat` 和 `/chat-integrated` 使用同一个真实 Pi 前台。普通消息持久复用主对话。
- Pi assistant 的完整 `courseware` Markdown 块触发后台准备（兼容旧 `voice-call`）；原始块不展示。短段落分别显示为聊天气泡。
- 每条准备指令绑定一个任务并去重；Worker 使用独立 Pi 会话生成真实 React TSX。轻量教案就绪即持久化一张邀请卡，刷新不重复发送。生成、完成通知都不会开启语音；只有显式 start-voice 请求取得票据后才能连接该课堂。
- 课件先编译，失败会给同一 Worker 一次修复机会；失败后可手动重新生成。构建产物在无同源权限、无网络的 iframe 中运行，课件发出就绪事件后才连接语音。
- Realtime 接收本次目标、主对话片段和课件源码资料，支持布局查询、元素圈选和清除标记。
- 正常挂断一次文本总结，保存后回到发起它的原 Pi 主对话。已总结的按钮不会再开始新通话；再次上课请让 Pi 给出新按钮。
- 输入转写关闭，语音逐字字幕隐藏。录音只保存本机。

## 配置与文件

- `prompts/pi-chat.md`：主聊天系统提示词，可修改何时邀请语音学习和按钮文案。下一条 Pi 请求读取最新文件。
- `prompts/pi-worker.md`：Worker 的 TSX 输出规范。
- `data/config.json`：用户保存的 Realtime 教师提示词和模型版本；请优先通过后台编辑，避免并发覆盖。
- `private/api-key.json`：OpenAI 密钥，字段 `OPENAI_API_KEY`，权限 600。此副本已按用户指示从本机模板文件复制配置；不要分享该文件或含真实密钥的模板。
- Pi 模型读取 `~/.pi/agent/settings.json` 和 `models.json`；当前核验可用的是 `macaron / glm-5.2`。可用 `CLASSROOM_PI_PROVIDER`、`CLASSROOM_PI_MODEL` 覆盖。主聊天不加载技能或工具；Worker 使用独立 Pi 配置加载两项课程技能及明确列出的工具，不加载其他技能与扩展。Worker 的任务目录是工作约定，不是操作系统沙箱。
- `private/pi-classroom/chats/<id>/`：主对话记录与 Pi 会话。
- `private/pi-classroom/jobs/<id>/`：任务 manifest、独立 Worker 会话、Lesson.tsx、course.html 和总结状态。
- `private/recordings/`：本机录音。

构建复用本机现有 React、ReactDOM、esbuild 依赖：`/Users/jinqiuyu/Desktop/codex/outputs/web-courseware-demos-2026-11-03/tooling/node_modules`。迁移到其他机器前须安装这些依赖并调整 `course-build.mjs` 的依赖根路径。核心服务使用 Node.js（当前 26）和本机 `/opt/homebrew/bin/pi`。

## 验证与限制

2026-11-04 已做真实 Pi 两轮上下文验证、独立 Worker TSX 生成、浏览器课件交互与圈选、Realtime WebRTC/真实模型音频输出、一次挂断总结回传原主对话。语音检查使用浏览器模拟麦克风，不代表真人说话、口音、打断及教学质量已验收。详见 `evaluations/完整链路验证-2026-11-04.md`。

异常请求结果未知时不自动重发。进程强退可能丢失内存录音；模型生成的课件可能编译或渲染失败。当前是本机单用户开发 Demo，不是多用户部署服务。

旧 `pyagent-adapter.mjs` / `course-jobs.mjs` 等并行方案源码保留供审阅，当前服务器统一使用 `pi-runtime.mjs`、`classroom-api.mjs`、`course-build.mjs`，不运行两套接线。

每次修改须追加 `MAINTENANCE-LOG.md`，包含目的、做法、验证、未完成项；不记录密钥、私人消息原文或录音内容。

完整课件现在必须通过 TypeScript 检查，旧的“编译成功即就绪”产物会在读取时重新核验。类型检查不等于教学质量或所有交互已验收；运行时加载失败保留教案。Worker 超时上限改为 10 分钟，但语音入口不等待它；失败不会自动重复生成。

2026-11-04 教学修复：当前模型为 gpt-realtime-2.1。后台“通用教学判断与推进”同时作用于文字聊天和语音，按标准答案/开放任务区别反馈，不用百分比打分。轻量教案支持 items 实际字词和统一分页；完整课件使用 data-lesson-page / data-page-title，go_to_lesson_page 指定页码，set_lesson_focus 先显示待讲字词。自然打断采用更强降噪与持续语音过滤，无手动打断按钮。总结使用带独立元数据的全会话归档请求，普通教学输出不能冒充总结。

## 动态小课件与用户翻页（2026-11-04）

画框340×440，收起用户侧的知识脉络/课件切换按钮。用户仍可自由上下一页；宿主把user_navigation（actor=user、前后页及内容）发送给老师，与老师的go_to_lesson_page区分。翻页只补充Live上下文，不强制打断或追问；老师依据连续行为和对话自然调整。大纲采用16/22/28三个字号，Worker默认1页、必要时2页，简单排版。

Live和Realtime共享request_lesson_material工具：mode=create/revise、request、learnerState、可选baseMaterialId。服务端验证原账号和通话票据；每次独立Worker生成新版本，保留旧产物。以调用ID去重，同一课堂仅一个生成任务进行中；跨账号/跨课堂修改拒绝。后台结果在浏览器实际渲染就绪后通知老师，select_learning_view({view:'course',materialId})才会切屏，不自动替换或新增邀请卡。生成失败继续使用原材料。后续版本保存在原课堂materials列表中，并绑定相同chatId。

准备状态只供老师决策。等待时继续自然交流、相关解释或口头练习，必要时自然说明在准备练习；不机械播报、不伪称搜索文章。对应规则在后台的教学策略、Live语音/后台提示词、Worker提示词和课件就绪/失败消息中可编辑。新提示词和工具需要重新开启通话；已生成旧课件不会自动重做。

验证：自动测试覆盖归属、版本保留、幂等、并发限制、自由翻页和Live无强制追问；真实Worker新增Goodnight单页练习，类型检查与构建成功，产物HTTP200，未产生邀请卡。浏览器隔离预览验证用户翻页、材料就绪不切屏、模拟老师工具后切屏。尚未进行真人Live/Realtime通话中的自然择机调用验收。

## Pi 创建账号入口（2026-11-04）

账号页「让 Pi 创建测试账号」启动独立 Pi account 会话（bash工具、no-skills），由 Pi 执行固定本机脚本，脚本实际调用 macaron-dev-cli user create-user。CLI 创建即已注册；网页自动填入后点「登录并进入聊天」，不重复点注册。登录核验 UID 后，将用户明确指定的 email/password/uid 发给该账号独立 Pi 主会话，初始化成功才进入聊天。主聊天仍 no-tools/no-skills，不变成管理端聊天。

创建任务使用 requestId 去重；已成功的 CLI 结果复用，结果未知不再次创建。私有记录在 private/pi-accounts/<requestId>/，其中 account.json 是账号密码和 UID，session.jsonl 是 Pi 注册记录。对应主会话里会包含用户授权交给 Pi 的密码。不要分享这些目录。认证令牌不返回给 Pi 或网页；CLI原始响应仅保存在本机私有文件中。prompt-settings 后台新增「Pi 注册账号」「Pi 账号初始化」可编辑提示词。
