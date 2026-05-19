# 正式云部署说明

推荐结构：FastAPI、静态资源和后台接口放在同一个服务里，MySQL 使用云 MySQL 或 VPS 自建 MySQL。网页默认展示缓存结果，只有用户点击刷新才触发重接口。

## 推荐部署路线

优先级建议：

1. Render：最省心，连接 GitHub 后用 `render.yaml` 或 Dockerfile 自动部署，适合先把项目公开跑起来。
2. Railway：数据库和后端放在同一平台比较方便，适合希望少配网络的人。
3. Fly.io：性能和区域控制更灵活，但初次配置比 Render/Railway 略复杂。
4. VPS：长期最可控，适合后续加定时任务、Nginx、备份、监控，但需要自己维护服务器。

当前项目已准备好：

- `Dockerfile`：FastAPI + 静态资源同容器部署。
- `railway.toml`：Railway Docker 部署、健康检查和失败重启配置。
- `.dockerignore`：不把本地缓存、依赖、数据库、输出图片打进镜像。
- `render.yaml`：Render Blueprint 示例。
- `.env.example`：本地和云端环境变量模板。
- `sql/schema.sql`：云 MySQL 初始化表结构。

## 环境变量

部署平台需要配置：

- `RSSCAST_MCP_TOKEN`：RssCast MCP token。
- `IFIND_USERNAME` / `IFIND_PASSWORD`：iFinD 同花顺量化 API 账号密码。Railway/Linux 云端会优先通过 iFinD Python SDK 调用 `THS_iFinDLogin` 和 `THS_HistoryQuotes`，不需要登录同花顺客户端；SDK 不可用或调用失败时自动回退原数据源。
- `IFIND_HISTORY_FIELDS` / `IFIND_HISTORY_OPTIONS`：iFinD 历史行情字段和参数，默认 `open;high;low;close;volume;amount` 和日频前复权设置。
- `MARKET_DB_HOST` / `MARKET_DB_PORT` / `MARKET_DB_USER` / `MARKET_DB_PASSWORD` / `MARKET_DATA_DB`：云 MySQL 连接信息。
- `APP_PASSWORD`：自选池添加/删除的管理密码。本地不配置时默认免登录；公开站点的查看、刷新、生成和数据更新不需要登录。
- `APP_SESSION_SECRET`：登录 cookie 签名密钥，建议使用长随机字符串。
- `APP_COOKIE_SECURE=1`：HTTPS 部署时开启安全 cookie。
- `API_CACHE_TTL_SECONDS=900`：接口缓存时间，默认 15 分钟。

## MySQL 准备

云端必须有可访问的 MySQL，并包含 `market_data.daily_data` 表。推荐流程：

1. 在云 MySQL 创建数据库 `market_data`。
2. 执行 `sql/schema.sql` 初始化 `daily_data` 表。
3. 从本机导出必要历史数据。
4. 导入云 MySQL。
5. 用部署平台的环境变量把连接信息填进去。

示例命令：

```bash
mysql -h <cloud-host> -u <cloud-user> -p < sql/schema.sql
mysqldump -h 127.0.0.1 -u root market_data daily_data > market_data_daily_data.sql
mysql -h <cloud-host> -u <cloud-user> -p market_data < market_data_daily_data.sql
```

不要把 `.sql` 文件提交到 GitHub，仓库已通过 `.gitignore` 和 `.dockerignore` 忽略。

## Render

1. 把项目推送到 GitHub。
2. 在 Render 新建 Blueprint 或 Web Service。
3. 如果使用 Blueprint，选择本项目根目录，Render 会读取 `render.yaml`。
4. 如果手动建服务，选择 Docker 环境，Dockerfile 路径为 `./Dockerfile`。
5. 填写环境变量，尤其是 `RSSCAST_MCP_TOKEN`、MySQL 连接信息、`APP_PASSWORD`。
6. 首次上线后打开网页，输入访问密码，点击“一键更新数据”，观察页面顶部进度条。

## Railway / Fly.io

Railway 推荐操作：

1. 连接 GitHub 仓库 `linyuan0915/market-desk`，Root Directory 填 `.`。
2. Railway 会读取 `railway.toml` 并使用 `Dockerfile` 构建。
3. 绑定云 MySQL，把本地 `market_data.daily_data` 迁移到云库，或让网页首次更新时逐步补数据。
4. 在 Variables 中配置上方变量，尤其是 `IFIND_USERNAME`、`IFIND_PASSWORD`、`MARKET_DB_*`、`APP_PASSWORD`、`APP_SESSION_SECRET`。
5. Deploy 后打开 `/api/health`，确认 `data_sources.ifind.sdk_available` 为 `true` 时，说明云端 iFinD SDK 已可加载；如果为 `false`，网页仍会自动回退原数据源。
6. 首次上线后打开网页，点击“一键更新数据”，观察页面顶部后台进度条。

Fly.io 可复用同一个 `Dockerfile`，启动命令使用默认 `uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}`。

## VPS

1. 安装 Docker 和 MySQL，或连接外部云 MySQL。
2. 在项目目录执行：

```bash
docker build -t market-desk .
docker run -d --name market-desk --env-file .env -p 8000:8000 market-desk
```

3. 用 Nginx 反向代理到 `http://127.0.0.1:8000`，并配置 HTTPS。

最小 Nginx 示例：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 运行机制

- 首页驾驶舱已拆成分块异步加载：外围风险、市场情绪、资金主线、宏观压力、自选异动和数据新鲜度互不阻塞。
- 重接口有服务端缓存和前端页面缓存：切换模块优先展示上次结果，点击模块内刷新按钮才强制更新。
- 数据更新接口已改成后台任务：`POST /api/data-refresh` 创建任务，`GET /api/data-refresh/{job_id}` 查询进度。
- 设置 `APP_PASSWORD` 后，只有自选池添加/删除需要输入密码；查看、刷新、生成简报和数据更新保持公开可用。

## 上线检查

上线后依次检查：

1. 访问首页，确认静态页面正常打开。
2. 打开 `/api/health`，确认 `ok` 为 `true`，数据库连接正常。
3. 打开 `/api/auth/status`，确认 `enabled` 为 `true`。
4. 点击“一键更新数据”，确认能启动后台任务；公开站点只有自选池新增/删除需要密码。
5. 打开“本地数据中心”，确认云 MySQL 读写日期、标的数量正常。
6. 打开“早盘驾驶舱”，确认分块异步加载完成。
