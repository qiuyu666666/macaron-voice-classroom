#!/bin/zsh
cd "${0:A:h}" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
console_url='http://127.0.0.1:4327/'
chat_url='http://127.0.0.1:4327/chat'
console_health() {
  /usr/bin/curl --noproxy '127.0.0.1,localhost' --silent --fail --max-time 3 "$console_url" | /usr/bin/grep -q '<title>课堂 · Realtime 调试台</title>'
}
if console_health; then
  print '调试台正在运行。地址：http://127.0.0.1:4327/'
  /usr/bin/open "$chat_url"
  print '若浏览器没有自动打开，请复制上方地址到这台 Mac 的浏览器地址栏。'
  exit 0
fi
if /usr/sbin/lsof -nP -iTCP:4327 -sTCP:LISTEN >/dev/null; then
  print '4327 已被进程占用，但页面检查未通过。未停止其他进程。'
  print '请将此提示告知助手；不要修改代理或安全设置。'
  read '?按回车关闭。'
  exit 1
fi
if ! command -v node >/dev/null; then
  print '未找到 Node.js。请安装支持 --use-env-proxy 的 Node.js 后再试。'
  read '?按回车关闭。'
  exit 1
fi
print '正在启动调试台。请保持此终端窗口开启；Ctrl+C 可停止。'
(
  for attempt in {1..20}; do
    if console_health; then /usr/bin/open "$chat_url"; exit 0; fi
    sleep 1
  done
  print '启动后 20 秒仍未通过页面检查，请查看本终端错误提示。'
) &
# Reuse this Mac's enabled HTTP proxy for this server only.
if [[ -z "$HTTPS_PROXY" && -z "$https_proxy" ]]; then
  proxy_settings=$(/usr/sbin/scutil --proxy)
  proxy_enabled=$(print -r -- "$proxy_settings" | /usr/bin/awk '/HTTPSEnable :/{print $3}')
  proxy_host=$(print -r -- "$proxy_settings" | /usr/bin/awk '/HTTPSProxy :/{print $3}')
  proxy_port=$(print -r -- "$proxy_settings" | /usr/bin/awk '/HTTPSPort :/{print $3}')
  if [[ "$proxy_enabled" == "1" && -n "$proxy_host" && "$proxy_port" == <-> ]]; then
    export HTTPS_PROXY="http://$proxy_host:$proxy_port" HTTP_PROXY="http://$proxy_host:$proxy_port"
    export NO_PROXY="127.0.0.1,localhost"
  fi
fi
PORT=4327 node --use-env-proxy server.mjs
console_exit=$?
print "服务已退出（状态 $console_exit）。此窗口关闭后不会自动重启。"
read '?按回车关闭。'
