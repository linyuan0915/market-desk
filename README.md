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

## 数据库

初始化 MySQL：

```bash
mysql -u root -p < sql/schema.sql
```

需要的环境变量见 `.env.example`。

## 部署

正式部署建议使用 Render、Railway、Fly.io 或 VPS。详细步骤见 `DEPLOY.md`。

## 安全说明

不要提交 `.env`、数据库 dump、运行输出图片或 token。仓库已通过 `.gitignore` 和 `.dockerignore` 忽略这些文件。
