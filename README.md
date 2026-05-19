# Market Desk

A 股行情分析工作台。项目使用 FastAPI 同时提供后端 API 和静态前端页面，重点覆盖早盘驾驶舱、市场宽度、市场情绪、自选观察、本地数据中心、跨市场风险、板块资金热力图和宏观商品。

## 核心特性

- 早盘驾驶舱：外围风险、情绪温度、资金主线、宏观压力、自选异动分块异步加载。
- 重接口缓存：模块切换优先显示上次结果，点击刷新才重新调用接口。
- 后台数据更新：一键更新会创建后台任务，前端显示进度。
- 云部署友好：支持 Docker、Render、Railway、Fly.io、VPS。
- 权限边界：公开网页可查看、刷新、生成和更新数据；配置 `APP_PASSWORD` 后，仅自选池添加/删除需要输入密码。

## 本地运行

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export RSSCAST_MCP_TOKEN="your-token"
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

访问：

```text
http://127.0.0.1:8000
```

如果只是想启动本机网页，可以直接运行：

```bash
./scripts/start_local_server.sh
```

后台运行并自动守护端口，适合日常使用：

```bash
./scripts/run_local_server_background.sh
```

停止后台服务：

```bash
./scripts/stop_local_server.sh
```

在 macOS 上也可以安装 LaunchAgent，让本机登录后自动保持 `http://127.0.0.1:8000` 可访问：

```bash
./scripts/install_local_launch_agent.sh
```

如果项目放在 Desktop、Documents 等受 macOS 隐私权限保护的位置，LaunchAgent 可能被系统拦截；这种情况下使用 `./scripts/run_local_server_background.sh` 更稳。

取消常驻服务：

```bash
./scripts/uninstall_local_launch_agent.sh
```

## 数据库

初始化 MySQL：

```bash
mysql -u root -p < sql/schema.sql
```

需要的环境变量见 `.env.example`。

## 数据源优先级

- 市场宽度继续使用大盘云图 skill，不改动。
- 历史行情优先使用 iFinD 同花顺量化 API：Railway/Linux 云端通过 iFinD Python SDK 执行 `THS_iFinDLogin` + `THS_HistoryQuotes`，不需要登录同花顺客户端。
- 本机或云端未安装 iFinD Python SDK 时，会自动回退到 RssCast、Yahoo、akshare 和公开行情接口，网页不会因为 iFinD 不可用而崩溃。
- macOS 本机当前保持自动回退；公开站点部署到 Railway/Linux 后再优先走 iFinD SDK。
- iFinD 账号密码只放在 `.env.local` 或部署平台环境变量中，不写入代码、不提交 Git。

本地 `.env.local` 示例：

```bash
IFIND_USERNAME=your_username
IFIND_PASSWORD=your_password
```

安装 iFinD Python SDK 后，可用健康检查确认状态：

```bash
curl http://127.0.0.1:8000/api/health
```

## 部署

正式部署建议使用 Render、Railway、Fly.io 或 VPS。详细步骤见 `DEPLOY.md`。

## 安全说明

不要提交 `.env`、数据库 dump、运行输出图片或 token。仓库已通过 `.gitignore` 和 `.dockerignore` 忽略这些文件。

## 回滚

关键修改前保留了本地稳定分支：

```bash
git switch backup/stable-20260519-1051
```
