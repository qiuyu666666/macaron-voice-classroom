# 最小 TSX 课堂
源文件 Lesson.tsx；内容字段 public/lesson-state.json；预编译脚本 public/lesson.bundle.js，启动不需要安装依赖。
重建需要 React、react-dom、esbuild：在项目目录安装开发依赖后运行 `npx esbuild classroom-src/Lesson.tsx --bundle --minify --outfile=public/lesson.bundle.js`。本次使用本机已存在的依赖离线构建，没有下载。
入口 /paged-lesson，控制台内可展开。window.lessonTest 只用于本机模拟 measure/highlight/next/previous；每次要求当前 pageId/revision，拒绝旧版本。不注册真实模型工具。
状态字段与TSX分离，但没有在线改字段保存接口。PNG是当前页文字与用户笔迹的简化合成，不是完整DOM截图。图片进入控制台后使用input_image，语义事件用user/input_text；需要用户主动真实连接才发送。独立打开课堂时没有Realtime连接。
生成接口建议只接受目标、课件schema版本和当前页ID，返回结构化字段补丁；后台校验、预览批准后更新。当前未实现此生成执行器，也不开放shell、路径或token。模型工具回传须使用同一call_id的function_call_output，并区分等待、成功、失败和超时；现有generate_lesson_content仍为模拟。
音量动画复用远端音轨，不连接额外扬声器、不录音、不转写。合成音轨测试已通过，实际设备播放尚未验证。浏览器阻止AudioContext时保持静态，需浏览器用户手势恢复。

更新：已接入三个Realtime受限工具schema与父子页面dispatcher，工具结果按call_id回传；非仅lessonTest模拟。未做真实模型调用。任意坐标圈画不开放。
