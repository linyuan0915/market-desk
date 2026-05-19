const state = {
  imageUrl: null,
  stats: null,
  expanded: new Set(),
  lastPayload: null,
  lastWatchlist: null,
  watchCategory: "全部",
  fundKind: "industry",
  view: "desk",
  cache: {},
  deskCards: {},
  refreshJobTimer: null,
};

const refreshDataBtn = document.getElementById("refreshDataBtn");
const refreshBtn = document.getElementById("refreshBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const previewBtn = document.getElementById("previewBtn");
const notice = document.getElementById("notice");
const heatmap = document.getElementById("interactiveHeatmap");
const modal = document.getElementById("modal");
const modalImage = document.getElementById("modalImage");
const generateBriefBtn = document.getElementById("generateBriefBtn");
const refreshIndicesBtn = document.getElementById("refreshIndicesBtn");
const refreshSentimentBtn = document.getElementById("refreshSentimentBtn");
const refreshWatchlistBtn = document.getElementById("refreshWatchlistBtn");
const refreshDataCenterBtn = document.getElementById("refreshDataCenterBtn");
const refreshCrossMarketBtn = document.getElementById("refreshCrossMarketBtn");
const refreshSectorFundsBtn = document.getElementById("refreshSectorFundsBtn");
const refreshFundMainlineBtn = document.getElementById("refreshFundMainlineBtn");
const refreshMacroBtn = document.getElementById("refreshMacroBtn");
const watchlistForm = document.getElementById("watchlistForm");

function cacheKey(url) {
  return url.replace(/[?&]refresh=1\b/, "").replace(/\?$/, "");
}

function withRefresh(url, force) {
  if (!force) return url;
  return `${url}${url.includes("?") ? "&" : "?"}refresh=1`;
}

async function fetchJson(url, options = {}) {
  const force = Boolean(options.force);
  const key = options.cacheKey || cacheKey(url);
  if (!force && state.cache[key]) return state.cache[key];
  const response = await authFetch(withRefresh(url, force), options.fetchOptions || {});
  if (response.status === 401) {
    const authed = await promptLogin();
    if (authed) return fetchJson(url, options);
  }
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  state.cache[key] = data;
  return data;
}

async function promptLogin() {
  const password = window.prompt("请输入访问密码后继续操作");
  if (!password) return false;
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) {
    showNotice("登录失败：访问密码错误或会话不可用。", true);
    return false;
  }
  return true;
}

async function authFetch(url, options = {}) {
  const response = await fetch(url, options);
  if (response.status !== 401) return response;
  const authed = await promptLogin();
  if (!authed) return response;
  return fetch(url, options);
}

function clearDataCache() {
  state.cache = {};
  state.deskCards = {};
}

function showNotice(text, isError = false) {
  notice.textContent = text;
  notice.classList.toggle("hidden", !text);
  notice.style.borderColor = isError ? "#e6aaa4" : "#f0cf84";
  notice.style.background = isError ? "#fff1f0" : "#fff7df";
  notice.style.color = isError ? "#84211a" : "#6a4c00";
}

async function loadAll() {
  const [statusResponse, dataResponse] = await Promise.all([
    fetch("/api/status"),
    fetch("/api/market-breadth/data"),
  ]);
  const status = await statusResponse.json();
  const data = await dataResponse.json();
  state.imageUrl = status.image_url;
  state.stats = status.stats || data.stats;
  renderStatus(status);
  renderCommentary(data.commentary || status.commentary);
  renderHeatmap(data);
}

async function loadDesk(force = false) {
  showNotice(force ? "正在刷新早盘驾驶舱分块..." : "");
  renderDeskSkeleton();
  const sections = [
    ["cross", "外围风险"],
    ["sentiment", "市场情绪"],
    ["funds", "资金主线"],
    ["macro", "宏观压力"],
    ["watch", "自选异动"],
    ["freshness", "数据新鲜度"],
  ];
  await Promise.all(
    sections.map(async ([key]) => {
      const data = await fetchJson(`/api/desk-card/${key}`, { force, cacheKey: `desk-card:${key}` });
      if (key === "freshness") {
        renderDeskFreshness(data.data_freshness || []);
        return;
      }
      state.deskCards[key] = data;
      renderDeskCards();
      renderDeskAggregate();
    }),
  );
  showNotice("");
}

async function refreshData() {
  refreshDataBtn.disabled = true;
  refreshDataBtn.textContent = "启动中";
  showNotice("正在启动后台数据更新任务，页面可以继续浏览。");
  try {
    const response = await authFetch("/api/data-refresh", { method: "POST" });
    if (!response.ok) throw new Error(await response.text());
    const job = await response.json();
    renderRefreshJob(job);
    pollRefreshJob(job.job_id);
  } catch (error) {
    showNotice(`自动更新数据失败：${error.message}`, true);
    refreshDataBtn.disabled = false;
    refreshDataBtn.textContent = "一键更新数据";
  }
}

async function pollRefreshJob(jobId) {
  window.clearTimeout(state.refreshJobTimer);
  try {
    const response = await authFetch(`/api/data-refresh/${jobId}`);
    if (!response.ok) throw new Error(await response.text());
    const job = await response.json();
    renderRefreshJob(job);
    if (job.status === "completed" || job.status === "completed_with_warnings" || job.status === "failed") {
      refreshDataBtn.disabled = false;
      refreshDataBtn.textContent = "一键更新数据";
      clearDataCache();
      if (state.view === "desk") await loadDesk(job.status !== "failed");
      if (state.view === "dataCenter") await loadDataCenter(job.status !== "failed");
      if (state.view === "crossMarket") await loadCrossMarket(job.status !== "failed");
      showNotice(job.message || "数据更新任务结束。", job.status !== "completed");
      return;
    }
    state.refreshJobTimer = window.setTimeout(() => pollRefreshJob(jobId), 1200);
  } catch (error) {
    showNotice(`读取更新进度失败：${error.message}`, true);
  } finally {
    if (refreshDataBtn.disabled) refreshDataBtn.textContent = "更新中";
  }
}

async function loadDailyBrief() {
  const response = await fetch("/api/daily-brief/status");
  const data = await response.json();
  renderDailyBrief(data);
}

async function loadIndices(force = false) {
  showNotice(force ? "正在调用 RssCast MCP 刷新 A 股核心指数..." : "");
  const data = await fetchJson("/api/a-share/indices", { force });
  renderIndices(data);
  showNotice("");
}

async function loadWatchlist(force = false) {
  showNotice(force ? "正在调用 RssCast MCP 刷新自选股..." : "");
  const data = await fetchJson("/api/watchlist", { force });
  renderWatchlist(data);
  showNotice("");
}

async function loadSentiment(force = false) {
  showNotice(force ? "正在整合指数、市场宽度、量能、风格和自选股，计算市场情绪..." : "");
  const data = await fetchJson("/api/market-sentiment", { force });
  renderSentiment(data);
  showNotice("");
}

async function loadDataCenter(force = false) {
  showNotice(force ? "正在读取本地 MySQL market_data 数据覆盖情况..." : "");
  const data = await fetchJson("/api/data-center", { force });
  renderDataCenter(data);
  showNotice("");
}

async function loadCrossMarket(force = false) {
  showNotice(force ? "正在读取港股、美股、波动率和 A 股指数，计算外围风险..." : "");
  const data = await fetchJson("/api/cross-market-risk", { force });
  renderCrossMarket(data);
  showNotice("");
}

async function loadSectorFunds(kind = state.fundKind, force = false) {
  state.fundKind = kind;
  showNotice(force ? "正在读取东方财富板块主力资金流..." : "");
  const data = await fetchJson(`/api/sector-funds?kind=${encodeURIComponent(kind)}`, { force });
  renderSectorFunds(data);
  loadFundMainline(kind, force).catch((error) => showNotice(`资金主线加载失败：${error.message}`, true));
  showNotice("");
}

async function loadFundMainline(kind = state.fundKind, force = false) {
  const data = await fetchJson(`/api/fund-mainline?kind=${encodeURIComponent(kind)}`, { force });
  renderFundMainline(data);
}

async function loadMacro(force = false) {
  showNotice(force ? "正在读取美债、汇率和热门商品数据..." : "");
  const data = await fetchJson("/api/macro-commodities", { force });
  renderMacro(data);
  showNotice("");
}

function switchView(view) {
  state.view = view;
  document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  document.getElementById("deskView").classList.toggle("hidden", view !== "desk");
  document.getElementById("breadthView").classList.toggle("hidden", view !== "breadth");
  document.getElementById("dailyView").classList.toggle("hidden", view !== "daily");
  document.getElementById("indicesView").classList.toggle("hidden", view !== "indices");
  document.getElementById("sentimentView").classList.toggle("hidden", view !== "sentiment");
  document.getElementById("watchlistView").classList.toggle("hidden", view !== "watchlist");
  document.getElementById("dataCenterView").classList.toggle("hidden", view !== "dataCenter");
  document.getElementById("crossMarketView").classList.toggle("hidden", view !== "crossMarket");
  document.getElementById("sectorFundsView").classList.toggle("hidden", view !== "sectorFunds");
  document.getElementById("macroView").classList.toggle("hidden", view !== "macro");
  if (view === "desk") {
    document.getElementById("pageTitle").textContent = "早盘驾驶舱";
    document.getElementById("pageSubtitle").textContent = "外围风险 · 情绪温度 · 资金主线 · 宏观压力 · 自选异动";
    loadDesk(false).catch((error) => showNotice(`早盘驾驶舱加载失败：${error.message}`, true));
    return;
  }
  if (view === "breadth") {
    document.getElementById("pageTitle").textContent = "市场宽度";
    document.getElementById("pageSubtitle").textContent = "大盘云图 MA20 站上率 · 一级行业聚合";
    renderStatus({
      generated_at: state.lastStatus?.generated_at,
      image_url: state.imageUrl,
      stats: state.stats,
    });
  } else {
    if (view === "indices") {
      document.getElementById("pageTitle").textContent = "A股指数";
      document.getElementById("pageSubtitle").textContent = "RssCast MCP · 核心指数与量能状态";
      loadIndices(false).catch((error) => showNotice(`A股指数加载失败：${error.message}`, true));
      return;
    }
    if (view === "watchlist") {
      document.getElementById("pageTitle").textContent = "自选观察";
      document.getElementById("pageSubtitle").textContent = "RssCast MCP · 个股行情与技术状态";
      loadWatchlist(false).catch((error) => showNotice(`自选观察加载失败：${error.message}`, true));
      return;
    }
    if (view === "sentiment") {
      document.getElementById("pageTitle").textContent = "市场情绪";
      document.getElementById("pageSubtitle").textContent = "交易状态判断 · 情绪温度计";
      loadSentiment(false).catch((error) => showNotice(`市场情绪加载失败：${error.message}`, true));
      return;
    }
    if (view === "dataCenter") {
      document.getElementById("pageTitle").textContent = "本地数据中心";
      document.getElementById("pageSubtitle").textContent = "SQL 数据覆盖 · 缺失诊断 · 可用性判断";
      loadDataCenter(false).catch((error) => showNotice(`本地数据中心加载失败：${error.message}`, true));
      return;
    }
    if (view === "crossMarket") {
      document.getElementById("pageTitle").textContent = "跨市场风险";
      document.getElementById("pageSubtitle").textContent = "A 股开盘前外围环境观察";
      loadCrossMarket(false).catch((error) => showNotice(`跨市场风险加载失败：${error.message}`, true));
      return;
    }
    if (view === "sectorFunds") {
      document.getElementById("pageTitle").textContent = "板块资金热力图";
      document.getElementById("pageSubtitle").textContent = "行业 / 概念 / 地域主力资金流向";
      loadSectorFunds(state.fundKind, false).catch((error) => showNotice(`板块资金加载失败：${error.message}`, true));
      return;
    }
    if (view === "macro") {
      document.getElementById("pageTitle").textContent = "宏观商品";
      document.getElementById("pageSubtitle").textContent = "美元 · 美债 · 人民币 · 黄金 · 原油 · 铜 · 黑色商品";
      loadMacro(false).catch((error) => showNotice(`宏观商品加载失败：${error.message}`, true));
      return;
    }
    document.getElementById("pageTitle").textContent = "每日行情";
    document.getElementById("pageSubtitle").textContent = "多资产市场简报 · 先结论后数据";
    loadDailyBrief();
  }
}

function renderStatus(status) {
  const stats = status.stats;
  state.lastStatus = status;
  document.getElementById("statusLabelA").textContent = "交易日";
  document.getElementById("statusLabelB").textContent = "全市场均值";
  document.getElementById("statusLabelC").textContent = "更新时间";
  document.getElementById("generatedAt").textContent = status.generated_at || "-";
  document.getElementById("latestDate").textContent = stats?.latest_date || "-";
  document.getElementById("avgValue").textContent = stats ? `${stats.average.toFixed(1)}%` : "-";
  document.getElementById("strongest").textContent = stats ? `${stats.strongest.category} ${stats.strongest.value.toFixed(1)}` : "-";
  document.getElementById("weakest").textContent = stats ? `${stats.weakest.category} ${stats.weakest.value.toFixed(1)}` : "-";
  document.getElementById("categoryCount").textContent = stats ? `${stats.categories_count} 个` : "-";
  document.getElementById("improvedList").innerHTML = renderRank(stats?.improved || [], "up");
  document.getElementById("weakenedList").innerHTML = renderRank(stats?.weakened || [], "down");

  if (status.image_url) {
    const url = `${status.image_url}?t=${Date.now()}`;
    modalImage.src = url;
    document.getElementById("downloadBtn").href = status.image_url;
  }
}

function renderCommentary(commentary) {
  document.getElementById("commentaryConclusion").textContent = commentary?.conclusion || "-";
  document.getElementById("commentaryAnalysis").innerHTML = (commentary?.analysis || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
}

function renderDesk(data) {
  document.getElementById("statusLabelA").textContent = "综合环境";
  document.getElementById("statusLabelB").textContent = "信号数量";
  document.getElementById("statusLabelC").textContent = "更新时间";
  document.getElementById("latestDate").textContent = `${data.score ?? "-"} / 100`;
  document.getElementById("avgValue").textContent = `${(data.cards || []).length} 个`;
  document.getElementById("generatedAt").textContent = data.generated_at || "-";
  document.getElementById("deskScore").textContent = data.score ?? "-";
  document.getElementById("deskState").textContent = data.score >= 65 ? "偏积极" : data.score >= 50 ? "分化" : "偏谨慎";
  document.getElementById("deskNeedle").style.left = `${Math.max(0, Math.min(100, Number(data.score || 0)))}%`;
  document.getElementById("deskConclusion").innerHTML = `
    <span>今日工作流</span>
    <h2>${escapeHtml(data.conclusion?.title || "-")}</h2>
    <p>${escapeHtml((data.conclusion?.analysis || [])[0] || "-")}</p>
    <ul>${(data.conclusion?.analysis || []).slice(1).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
  `;
  document.getElementById("deskCards").innerHTML = (data.cards || []).map(renderDeskCard).join("");
  document.getElementById("deskFreshness").innerHTML = (data.data_freshness || [])
    .map(
      (row) => `
        <div>
          <span>${escapeHtml(row.market)}</span>
          <strong>${escapeHtml(row.max_date || "-")}</strong>
          <em>${formatNumber(row.code_count, 0)} 个标的 · ${formatNumber(row.rows_count, 0)} 行</em>
        </div>
      `,
    )
    .join("");
}

function renderDeskSkeleton() {
  const keys = [
    ["cross", "外围风险"],
    ["sentiment", "市场情绪"],
    ["funds", "资金主线"],
    ["macro", "宏观压力"],
    ["watch", "自选异动"],
  ];
  document.getElementById("deskCards").innerHTML = keys.map(([key, title]) => renderDeskCardSkeleton(key, title)).join("");
  document.getElementById("deskConclusion").innerHTML = `
    <span>今日工作流</span>
    <h2>正在并行读取关键分块</h2>
    <p>先展示缓存结果；点击刷新时才重新调用接口。</p>
  `;
}

function renderDeskCardSkeleton(key, title) {
  return `
    <article class="desk-card loading" data-desk-card="${key}">
      <div class="desk-card-head"><span>${escapeHtml(title)}</span><em>加载中</em></div>
      <div class="skeleton-line wide"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line short"></div>
    </article>
  `;
}

function renderDeskCards() {
  const order = ["cross", "sentiment", "funds", "macro", "watch"];
  document.getElementById("deskCards").innerHTML = order
    .map((key) => (state.deskCards[key] ? renderDeskCard(state.deskCards[key]) : renderDeskCardSkeleton(key, deskTitle(key))))
    .join("");
}

function renderDeskAggregate() {
  const cards = Object.values(state.deskCards);
  const scores = cards.map((card) => card.score).filter((score) => Number.isFinite(Number(score))).map(Number);
  const score = scores.length ? Math.round(scores.reduce((sum, item) => sum + item, 0) / scores.length) : 50;
  const strongest = cards.filter((card) => Number.isFinite(Number(card.score))).sort((a, b) => Number(b.score) - Number(a.score))[0];
  const weakest = cards.filter((card) => Number.isFinite(Number(card.score))).sort((a, b) => Number(a.score) - Number(b.score))[0];
  const title =
    score >= 65 ? "早盘环境偏积极，可以围绕资金主线寻找扩散。" : score >= 50 ? "早盘环境中性偏分化，先看主线能否延续。" : "早盘环境偏谨慎，先控风险再看修复。";
  document.getElementById("statusLabelA").textContent = "综合环境";
  document.getElementById("statusLabelB").textContent = "已加载信号";
  document.getElementById("statusLabelC").textContent = "更新时间";
  document.getElementById("latestDate").textContent = `${score} / 100`;
  document.getElementById("avgValue").textContent = `${cards.length} / 5`;
  document.getElementById("generatedAt").textContent = new Date().toLocaleString("zh-CN", { hour12: false });
  document.getElementById("deskScore").textContent = score;
  document.getElementById("deskState").textContent = score >= 65 ? "偏积极" : score >= 50 ? "分化" : "偏谨慎";
  document.getElementById("deskNeedle").style.left = `${Math.max(0, Math.min(100, score))}%`;
  document.getElementById("deskConclusion").innerHTML = `
    <span>今日工作流</span>
    <h2>${escapeHtml(title)}</h2>
    <p>综合分 ${score}/100，最强信号来自${escapeHtml(strongest?.title || "-")}，最弱约束来自${escapeHtml(weakest?.title || "-")}。</p>
    <ul><li>各分块独立加载，慢接口不会阻塞整页。</li><li>模块切换优先显示上次结果，点击刷新才重新取数。</li></ul>
  `;
}

function renderDeskFreshness(rows) {
  document.getElementById("deskFreshness").innerHTML = rows
    .map(
      (row) => `
        <div>
          <span>${escapeHtml(row.market)}</span>
          <strong>${escapeHtml(row.max_date || "-")}</strong>
          <em>${formatNumber(row.code_count, 0)} 个标的 · ${formatNumber(row.rows_count, 0)} 行</em>
        </div>
      `,
    )
    .join("");
}

function deskTitle(key) {
  return { cross: "外围风险", sentiment: "市场情绪", funds: "资金主线", macro: "宏观压力", watch: "自选异动" }[key] || key;
}

function renderDeskCard(card) {
  const score = card.score === null || card.score === undefined ? "-" : `${Math.round(card.score)} / 100`;
  return `
    <article class="desk-card">
      <div class="desk-card-head">
        <span>${escapeHtml(card.title)}</span>
        <em>${score}</em>
      </div>
      <h3>${escapeHtml(card.state || "-")}</h3>
      <strong>${escapeHtml(card.conclusion || "-")}</strong>
      <dl>
        <dt>为什么重要</dt>
        <dd>${escapeHtml(card.why || "-")}</dd>
        <dt>今天怎么用</dt>
        <dd>${escapeHtml(card.action || "-")}</dd>
      </dl>
      <small>${escapeHtml(card.source || "-")}</small>
    </article>
  `;
}

function renderRefreshJob(job) {
  const panel = document.getElementById("refreshJobPanel");
  const progress = Math.max(0, Math.min(100, Number(job.progress || 0)));
  const warnings = job.warnings || [];
  panel.classList.remove("hidden");
  document.getElementById("refreshJobTitle").textContent =
    job.status === "completed"
      ? "数据更新完成"
      : job.status === "completed_with_warnings"
        ? "数据更新部分完成"
        : job.status === "failed"
          ? "数据更新失败"
          : "后台更新数据";
  document.getElementById("refreshJobMessage").textContent = job.message || "-";
  document.getElementById("refreshJobPercent").textContent = `${Math.round(progress)}%`;
  document.getElementById("refreshProgressBar").style.width = `${progress}%`;
  const taskHtml = (job.tasks || [])
    .map(
      (task) => `
        <div>
          <strong>${escapeHtml(task.name || "-")}</strong>
          <span>${task.ok ? "完成" : "有警告"} · ${formatNumber(task.rows_upserted || 0, 0)} 行</span>
          ${task.warnings && task.warnings.length ? `<small>${escapeHtml(task.warnings.slice(0, 2).join("；"))}</small>` : ""}
        </div>
      `,
    )
    .join("");
  const warningHtml = warnings.length
    ? `<div class="refresh-job-warning"><strong>需要关注</strong><span>${escapeHtml(warnings.slice(0, 4).join("；"))}</span></div>`
    : "";
  document.getElementById("refreshJobTasks").innerHTML = taskHtml + warningHtml;
}

function renderRank(rows, className) {
  return rows
    .map(
      (row) => `
        <li>
          <span>${escapeHtml(row.category)}</span>
          <strong class="${className}">${row.change > 0 ? "+" : ""}${row.change.toFixed(1)}</strong>
        </li>
      `,
    )
    .join("");
}

function renderDailyBrief(data) {
  document.getElementById("briefTitle").textContent = data.title || "每日行情";
  document.getElementById("briefSubtitle").textContent = data.subtitle || (data.exists ? "市场行情简报" : "暂无简报");
  document.getElementById("briefGeneratedAt").textContent = data.generated_at || "-";
  document.getElementById("briefSkill").textContent = data.skill || "-";
  const downloadBriefBtn = document.getElementById("downloadBriefBtn");
  if (data.download_url) {
    downloadBriefBtn.href = data.download_url;
    downloadBriefBtn.classList.remove("disabled");
    downloadBriefBtn.textContent = "下载 Word";
  } else {
    downloadBriefBtn.removeAttribute("href");
    downloadBriefBtn.classList.add("disabled");
    downloadBriefBtn.textContent = "暂无 Word";
  }
  document.getElementById("statusLabelA").textContent = "简报日期";
  document.getElementById("statusLabelB").textContent = "内容板块";
  document.getElementById("statusLabelC").textContent = "更新时间";
  document.getElementById("latestDate").textContent = data.subtitle ? data.subtitle.replace("交易日期", "").trim() : "-";
  document.getElementById("avgValue").textContent = data.exists ? `${(data.sections || []).length} 个` : "-";
  document.getElementById("generatedAt").textContent = data.generated_at || "-";

  const content = document.getElementById("briefContent");
  if (!data.exists) {
    content.innerHTML = `<div class="empty-state">${escapeHtml(data.message || "暂无每日行情简报。")}</div>`;
    return;
  }
  content.innerHTML = (data.sections || [])
    .map((section) => {
      const blocks = (section.blocks || []).map(renderBriefBlock).join("");
      return `<section class="brief-section"><h3>${escapeHtml(section.heading)}</h3>${blocks}</section>`;
    })
    .join("");
}

function renderIndices(data) {
  document.getElementById("statusLabelA").textContent = "行情时点";
  document.getElementById("statusLabelB").textContent = "成交额";
  document.getElementById("statusLabelC").textContent = "更新时间";
  document.getElementById("latestDate").textContent = data.trade_time ? data.trade_time.slice(0, 10) : "-";
  document.getElementById("avgValue").textContent = data.summary ? `${formatNumber(data.summary.core_amount_yi, 0)} 亿` : "-";
  document.getElementById("generatedAt").textContent = data.generated_at || "-";
  document.getElementById("indicesSubtitle").textContent = `${data.source} · ${data.trade_time || "-"}`;
  document.getElementById("indexSummary").innerHTML = renderSummary(data.summary);
  document.getElementById("indexCards").innerHTML = (data.indices || []).map(renderQuoteCard).join("");
  document.getElementById("indexTableBody").innerHTML = (data.indices || []).map(renderIndexRow).join("");
  document.getElementById("indexTrendList").innerHTML = Object.entries(data.histories || {})
    .map(([code, item]) => renderTrendRow(code, item))
    .join("");
}

function renderWatchlist(data) {
  state.lastWatchlist = data;
  const categories = data.categories || [];
  if (!categories.some((item) => item.name === state.watchCategory)) {
    state.watchCategory = "全部";
  }
  const items = data.items || [];
  const filteredItems =
    state.watchCategory === "全部" ? items : items.filter((row) => (row.category || "未分类") === state.watchCategory);
  document.getElementById("statusLabelA").textContent = "行情时点";
  document.getElementById("statusLabelB").textContent = "自选数量";
  document.getElementById("statusLabelC").textContent = "更新时间";
  document.getElementById("latestDate").textContent = data.trade_time ? data.trade_time.slice(0, 10) : "-";
  document.getElementById("avgValue").textContent = `${filteredItems.length} / ${items.length} 只`;
  document.getElementById("generatedAt").textContent = data.generated_at || "-";
  document.getElementById("watchlistSubtitle").textContent = `${data.source} · ${data.trade_time || "-"}`;
  document.getElementById("watchSummary").innerHTML = renderSummary(data.summary);
  renderWatchCategoryTabs(categories);
  document.getElementById("watchTableBody").innerHTML = filteredItems.length
    ? filteredItems.map(renderWatchRow).join("")
    : `<tr><td colspan="9" class="empty-cell">该分类下暂无自选股。</td></tr>`;
  document.querySelectorAll("[data-stock-detail]").forEach((button) => {
    button.addEventListener("click", () => loadStockDetail(button.dataset.stockDetail));
  });
  document.querySelectorAll("[data-stock-remove]").forEach((button) => {
    button.addEventListener("click", () => removeWatchItem(button.dataset.stockRemove));
  });
}

function renderWatchCategoryTabs(categories) {
  const tabs = document.getElementById("watchCategoryTabs");
  const options = document.getElementById("watchCategoryOptions");
  tabs.innerHTML = (categories.length ? categories : [{ name: "全部", count: 0 }])
    .map(
      (item) => `
        <button class="${item.name === state.watchCategory ? "active" : ""}" data-watch-category="${escapeHtml(item.name)}">
          ${escapeHtml(item.name)}
          <span>${Number(item.count || 0)}</span>
        </button>
      `,
    )
    .join("");
  options.innerHTML = categories
    .filter((item) => item.name !== "全部")
    .map((item) => `<option value="${escapeHtml(item.name)}"></option>`)
    .join("");
  tabs.querySelectorAll("[data-watch-category]").forEach((button) => {
    button.addEventListener("click", () => {
      state.watchCategory = button.dataset.watchCategory || "全部";
      renderWatchlist(state.lastWatchlist || { items: [], categories: [] });
    });
  });
}

function renderSentiment(data) {
  document.getElementById("statusLabelA").textContent = "行情时点";
  document.getElementById("statusLabelB").textContent = "情绪分数";
  document.getElementById("statusLabelC").textContent = "更新时间";
  document.getElementById("latestDate").textContent = data.trade_time ? data.trade_time.slice(0, 10) : "-";
  document.getElementById("avgValue").textContent = `${data.score} / 100`;
  document.getElementById("generatedAt").textContent = data.generated_at || "-";
  document.getElementById("sentimentSubtitle").textContent = `${data.source} · ${data.trade_time || "-"}`;
  document.getElementById("sentimentScore").textContent = data.score;
  document.getElementById("sentimentLabel").textContent = data.label;
  document.getElementById("sentimentTag").textContent = data.tag;
  document.getElementById("sentimentConclusion").textContent = data.conclusion;
  document.getElementById("sentimentNeedle").style.left = `${Math.max(0, Math.min(100, Number(data.score)))}%`;
  document.getElementById("sentimentComponents").innerHTML = (data.components || []).map(renderScoreBar).join("");
  document.getElementById("sentimentP1Grid").innerHTML = renderP1Diagnostics(data.p1 || {});
  document.getElementById("sentimentAnalysis").innerHTML = (data.analysis || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  document.getElementById("sentimentAlerts").innerHTML = ((data.p1 && data.p1.alerts) || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  renderSentimentHistory(data.p1 || {});
}

function renderDataCenter(data) {
  const ifind = data.data_sources?.ifind || {};
  const lastRefresh = data.data_sources?.last_refresh || null;
  const ifindState = ifind.status === "ready" ? "iFinD 已接入" : "iFinD 回退中";
  const refreshTasks = (lastRefresh?.tasks || [])
    .map(
      (task) => `
        <li>
          <strong>${escapeHtml(task.name || "-")}</strong>
          <span>${escapeHtml(task.source || "-")} · ${formatNumber(task.rows_upserted || 0, 0)} 行</span>
        </li>
      `,
    )
    .join("");
  document.getElementById("statusLabelA").textContent = "最新日期";
  document.getElementById("statusLabelB").textContent = "标的数量";
  document.getElementById("statusLabelC").textContent = "更新时间";
  document.getElementById("latestDate").textContent = data.coverage?.max_date || "-";
  document.getElementById("avgValue").textContent = data.coverage ? `${data.coverage.code_count} 个` : "-";
  document.getElementById("generatedAt").textContent = data.generated_at || "-";
  document.getElementById("dataCenterSubtitle").textContent = `${data.source || "MySQL"} · ${data.coverage?.min_date || "-"} 至 ${data.coverage?.max_date || "-"}`;
  const suggestions = (data.suggestions || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  document.getElementById("dataCenterSummary").innerHTML = `
    <span>数据诊断</span>
    <strong>${data.available === false ? escapeHtml(data.message || "本地数据库不可用。") : `当前库共 ${data.coverage.rows_count} 行，覆盖 ${data.coverage.market_count} 类市场、${data.coverage.code_count} 个标的。`}</strong>
    <div class="source-status">
      <div>
        <small>A股历史行情</small>
        <strong>${escapeHtml(ifindState)}</strong>
        <em>${escapeHtml(ifind.active_module || "备用数据源")} · ${ifind.sdk_available ? "SDK 可用" : "SDK 不可用"}</em>
      </div>
      <div>
        <small>最近更新来源</small>
        <strong>${escapeHtml(lastRefresh?.message || "暂无本轮更新记录")}</strong>
        ${refreshTasks ? `<ul>${refreshTasks}</ul>` : ""}
      </div>
    </div>
    ${suggestions ? `<ul>${suggestions}</ul>` : ""}
  `;
  document.getElementById("dataQualityGrid").innerHTML = (data.quality || [])
    .map(
      (row) => `
        <div class="quote-card">
          <span>${escapeHtml(row.status)}</span>
          <h3>${escapeHtml(row.market)}</h3>
          <strong>${formatNumber(row.code_count, 0)}</strong>
          <em>${escapeHtml(row.date_range)}</em>
          <small>${formatNumber(row.rows_count, 0)} 行 · 缺失 ${formatNumber(row.missing_total, 0)}</small>
        </div>
      `,
    )
    .join("");
  document.getElementById("dataMarketTableBody").innerHTML = (data.markets || [])
    .map(
      (row) => `
        <tr>
          <td><strong>${escapeHtml(row.market)}</strong></td>
          <td>${formatNumber(row.rows_count, 0)}</td>
          <td>${formatNumber(row.code_count, 0)}</td>
          <td>${escapeHtml(row.min_date)}</td>
          <td>${escapeHtml(row.max_date)}</td>
          <td>${formatNumber(row.missing_close, 0)}</td>
          <td>${formatNumber(row.missing_change_pct, 0)}</td>
          <td>${formatNumber(row.missing_amount, 0)}</td>
        </tr>
      `,
    )
    .join("");
}

function renderCrossMarket(data) {
  const risk = data.risk || {};
  document.getElementById("statusLabelA").textContent = "交易日";
  document.getElementById("statusLabelB").textContent = "外围风险";
  document.getElementById("statusLabelC").textContent = "更新时间";
  document.getElementById("latestDate").textContent = data.trade_date || "-";
  document.getElementById("avgValue").textContent = risk.score === undefined ? "-" : `${risk.score} / 100`;
  document.getElementById("generatedAt").textContent = data.generated_at || "-";
  document.getElementById("crossRiskScore").textContent = risk.score ?? "-";
  document.getElementById("crossRiskState").textContent = risk.state || "-";
  document.getElementById("crossRiskNeedle").style.left = `${Math.max(0, Math.min(100, Number(risk.score || 0)))}%`;
  document.getElementById("crossMarketSubtitle").textContent = `${data.source || "MySQL"} · ${data.trade_date || "-"}`;
  document.getElementById("crossMarketSummary").innerHTML = `
    <span>A股开盘前判断</span>
    <h2>${escapeHtml(data.summary?.conclusion || "-")}</h2>
    <p>${escapeHtml((data.summary?.analysis || [])[0] || "-")}</p>
  `;
  document.getElementById("crossRiskSignals").innerHTML = (data.summary?.analysis || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  document.getElementById("crossMarketCards").innerHTML = (data.items || []).map(renderCrossMarketCard).join("");
}

function renderCrossMarketCard(row) {
  const cls = Number(row.change_pct || 0) >= 0 ? "up" : "down";
  return `
    <div class="quote-card">
      <span>${escapeHtml(row.market)} · ${escapeHtml(row.code)}</span>
      <h3>${escapeHtml(row.name)}</h3>
      <strong>${formatNumber(row.close, 2)}</strong>
      <em class="${cls}">${formatPct(row.change_pct)}</em>
      <small>${escapeHtml(row.date)} · 成交额 ${formatNumber(Number(row.amount || 0) / 100000000, 0)} 亿</small>
    </div>
  `;
}

function renderSectorFunds(data) {
  document.querySelectorAll(".fund-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.fundKind === data.kind);
  });
  document.getElementById("statusLabelA").textContent = "资金维度";
  document.getElementById("statusLabelB").textContent = "板块数量";
  document.getElementById("statusLabelC").textContent = "更新时间";
  document.getElementById("latestDate").textContent = data.label || "-";
  document.getElementById("avgValue").textContent = `${(data.items || []).length} 个`;
  document.getElementById("generatedAt").textContent = data.generated_at || "-";
  document.getElementById("sectorFundsSubtitle").textContent = `${data.source || "东方财富"} · ${data.label || "-"}`;
  document.getElementById("sectorFundsSummary").innerHTML = renderSummary(data.summary);
  const rows = data.items || [];
  document.getElementById("sectorFundTreemap").innerHTML = rows.length ? renderFundTreemap(rows.slice(0, 40)) : `<div class="empty-state">${escapeHtml(data.summary?.conclusion || "暂无板块资金数据。")}</div>`;
  document.getElementById("sectorFundTableBody").innerHTML = rows
    .slice(0, 80)
    .map(
      (row) => `
        <tr>
          <td><strong>${escapeHtml(row.name)}</strong><span>${escapeHtml(row.code)}</span></td>
          <td class="${row.main_net_yi >= 0 ? "up" : "down"}">${formatSigned(row.main_net_yi)} 亿</td>
          <td>${row.main_ratio === null || row.main_ratio === undefined ? "-" : formatPct(row.main_ratio)}</td>
          <td class="${row.change_pct >= 0 ? "up" : "down"}">${formatPct(row.change_pct)}</td>
        </tr>
      `,
    )
    .join("");
}

function renderFundMainline(data) {
  document.getElementById("fundMainlineSummary").innerHTML = renderSummary(data.summary);
  const rows = data.items || [];
  document.getElementById("fundMainlineList").innerHTML = rows.length
    ? rows
        .map(
          (row) => `
            <div class="mainline-card">
              <div>
                <span>${escapeHtml(data.label)}主线</span>
                <strong>${escapeHtml(row.name)}</strong>
                <em>${escapeHtml(row.latest_date)} · ${escapeHtml(row.continuity_label || `连续 ${row.streak} 日`)}</em>
              </div>
              <div>
                <span>近3日</span>
                <strong class="${row.net3_yi >= 0 ? "up" : "down"}">${formatSigned(row.net3_yi)} 亿</strong>
              </div>
              <div>
                <span>近5日</span>
                <strong class="${row.net5_yi >= 0 ? "up" : "down"}">${formatSigned(row.net5_yi)} 亿</strong>
              </div>
            </div>
          `,
        )
        .join("")
    : `<div class="empty-state">${escapeHtml(data.summary?.conclusion || "暂无资金主线数据。")}</div>`;
}

function renderMacro(data) {
  document.getElementById("statusLabelA").textContent = "指标数量";
  document.getElementById("statusLabelB").textContent = "可用指标";
  document.getElementById("statusLabelC").textContent = "更新时间";
  document.getElementById("latestDate").textContent = `${(data.items || []).length} 个`;
  document.getElementById("avgValue").textContent = `${(data.items || []).filter((row) => row.available !== false).length} 个`;
  document.getElementById("generatedAt").textContent = data.generated_at || "-";
  document.getElementById("macroSubtitle").textContent = data.source || "akshare";
  document.getElementById("macroSummary").innerHTML = renderSummary(data.summary);
  const rows = data.items || [];
  document.getElementById("macroCards").innerHTML = rows
    .map(
      (row) => `
        <div class="quote-card ${row.available === false ? "diagnostic-muted" : ""}">
          <span>${escapeHtml(row.group)}</span>
          <h3>${escapeHtml(row.name)}</h3>
          <strong>${row.value === null || row.value === undefined ? "-" : formatNumber(row.value, 3)}</strong>
          <em class="${Number(row.change || 0) >= 0 ? "up" : "down"}">${row.change === null || row.change === undefined ? "-" : formatSigned(row.change)}</em>
          <small>${escapeHtml(row.date || "-")}</small>
        </div>
      `,
    )
    .join("");
  document.getElementById("macroTableBody").innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td><strong>${escapeHtml(row.group)}</strong></td>
          <td>${escapeHtml(row.name)}</td>
          <td>${row.value === null || row.value === undefined ? "-" : `${formatNumber(row.value, 4)}${escapeHtml(row.unit || "")}`}</td>
          <td class="${Number(row.change || 0) >= 0 ? "up" : "down"}">${row.change === null || row.change === undefined ? "-" : formatSigned(row.change)}</td>
          <td>${escapeHtml(row.date || "-")}</td>
          <td>${row.available === false ? escapeHtml(row.detail || "不可用") : "可用"}</td>
          <td>${escapeHtml(row.source || "-")}</td>
        </tr>
      `,
    )
    .join("");
}

function renderFundTreemap(rows) {
  const maxHeat = Math.max(...rows.map((row) => Number(row.heat || 0)), 1);
  return rows
    .map((row) => {
      const basis = Math.max(120, 120 + (Number(row.heat || 0) / maxHeat) * 280);
      const cls = Number(row.main_net_yi || 0) >= 0 ? "fund-in" : "fund-out";
      return `
        <div class="fund-tile ${cls}" style="flex-basis:${basis}px; flex-grow:${Math.max(1, Number(row.heat || 0) / maxHeat * 6)}">
          <strong>${escapeHtml(row.name)}</strong>
          <span>${formatSigned(row.main_net_yi)} 亿</span>
          <em>${formatPct(row.change_pct)}</em>
        </div>
      `;
    })
    .join("");
}

function renderP1Diagnostics(p1) {
  const items = [
    renderDiagnosticCard("涨跌停情绪", p1.limit_mood, (data) => [
      data.limit_up_count === null || data.limit_up_count === undefined ? "涨停：-" : `涨停：${data.limit_up_count} 只`,
      data.limit_down_count === null || data.limit_down_count === undefined ? "跌停：-" : `跌停：${data.limit_down_count} 只`,
    ]),
    renderDiagnosticCard("北向/资金流向", p1.northbound, (data) => [
      data.north_net_yi === undefined ? "北向：-" : `北向：${formatSigned(data.north_net_yi)} 亿`,
      data.south_net_yi === undefined ? "南向：-" : `南向：${formatSigned(data.south_net_yi)} 亿`,
    ]),
    renderDiagnosticCard("主力资金流", p1.capital_flow, (data) => [
      data.total_main_net_yi === undefined ? "主力净流：-" : `主力净流：${formatSigned(data.total_main_net_yi)} 亿`,
      data.rows ? `覆盖指数：${data.rows.length} 个` : "覆盖指数：-",
    ]),
    renderDiagnosticCard("行业拥挤度", p1.industry_crowding, (data) => [
      data.hot_count === undefined ? "偏热行业：-" : `偏热行业：${data.hot_count} 个`,
      data.cold_count === undefined ? "偏冷行业：-" : `偏冷行业：${data.cold_count} 个`,
      data.dispersion === undefined ? "极差：-" : `极差：${data.dispersion}`,
    ]),
    renderDiagnosticCard("情绪极值", p1.extreme, (data) => [
      data.percentile === undefined ? "分位：-" : `近端分位：${data.percentile}%`,
    ]),
  ];
  return items.join("");
}

function renderDiagnosticCard(title, data, metaBuilder) {
  const payload = data || {};
  const available = payload.available !== false;
  const meta = metaBuilder(payload).map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  const source = payload.source ? `<small>${escapeHtml(payload.source)}</small>` : "";
  return `
    <div class="diagnostic-card ${available ? "" : "diagnostic-muted"}">
      <span>${escapeHtml(title)}</span>
      <strong>${escapeHtml(payload.state || "-")}</strong>
      <p>${escapeHtml(payload.detail || "-")}</p>
      <div class="diagnostic-meta">${meta}</div>
      ${source}
    </div>
  `;
}

function renderScoreBar(item) {
  const score = Math.max(0, Math.min(100, Number(item.score || 0)));
  return `
    <div class="score-bar">
      <div class="score-bar-head">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(item.state)} · 权重 ${(Number(item.weight || 0) * 100).toFixed(0)}%</span>
        <em>${score}</em>
      </div>
      <div class="score-track"><div style="width:${score}%"></div></div>
      <p>${escapeHtml(item.detail)}</p>
    </div>
  `;
}

function renderSentimentHistory(p1) {
  const history = p1.history || [];
  const recent = history.slice(-30);
  const path = sparklinePath(recent.map((row) => Number(row.score)), 640, 120);
  document.getElementById("sentimentHistorySubtitle").textContent = `本地记录 ${history.length} 条 · 近20记录区间 ${p1.recent_low ?? "-"} - ${p1.recent_high ?? "-"}`;
  const chart =
    recent.length >= 2
      ? `<svg viewBox="0 0 640 120" preserveAspectRatio="none">
          <path d="${path.area}" class="spark-area"></path>
          <path d="${path.line}" class="spark-line"></path>
        </svg>`
      : `<div class="history-empty">情绪历史正在积累，形成 2 条以上记录后显示趋势线。</div>`;
  document.getElementById("sentimentHistory").innerHTML = `
    ${chart}
    <div class="sentiment-history-list">
      ${recent
        .slice(-8)
        .reverse()
        .map(
          (row) => `
            <div>
              <span>${escapeHtml(row.date)}</span>
              <strong>${row.score}</strong>
              <em>${escapeHtml(row.tag)}</em>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderSummary(summary) {
  if (!summary) return "";
  const analysis = (summary.analysis || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const leaders = summary.strongest
    ? `<div class="summary-leaders">
        <span>最强：<strong class="up">${escapeHtml(summary.strongest.name)} ${formatPct(summary.strongest.change_pct_display)}</strong></span>
        <span>最弱：<strong class="down">${escapeHtml(summary.weakest.name)} ${formatPct(summary.weakest.change_pct_display)}</strong></span>
      </div>`
    : "";
  return `
    <span>市场状态</span>
    <strong>${escapeHtml(summary.conclusion || "-")}</strong>
    ${leaders}
    ${analysis ? `<ul>${analysis}</ul>` : ""}
  `;
}

function renderQuoteCard(row) {
  const cls = Number(row.change_pct_display) >= 0 ? "up" : "down";
  return `
    <div class="quote-card">
      <span>${escapeHtml(row.code)}</span>
      <h3>${escapeHtml(row.name)}</h3>
      <strong>${formatNumber(row.close, 2)}</strong>
      <em class="${cls}">${formatPct(row.change_pct_display)}</em>
      <small>成交额 ${formatNumber(row.amount_yi, 0)} 亿</small>
    </div>
  `;
}

function renderIndexRow(row) {
  return `
    <tr>
      <td><strong>${escapeHtml(row.name)}</strong><span>${escapeHtml(row.code)}</span></td>
      <td>${formatNumber(row.close, 2)}</td>
      <td class="${row.change_pct_display >= 0 ? "up" : "down"}">${formatPct(row.change_pct_display)}</td>
      <td>${formatNumber(row.change_amount, 2)}</td>
      <td>${formatNumber(row.open, 2)}</td>
      <td>${formatNumber(row.high, 2)}</td>
      <td>${formatNumber(row.low, 2)}</td>
      <td>${formatNumber(row.amount_yi, 0)} 亿</td>
      <td>${formatPct(Number(row.amplitude || 0) * 100)}</td>
    </tr>
  `;
}

function renderWatchRow(row) {
  return `
    <tr>
      <td><strong>${escapeHtml(row.name)}</strong><span>${escapeHtml(row.code)}</span></td>
      <td><span class="category-pill">${escapeHtml(row.category || "未分类")}</span></td>
      <td>${formatNumber(row.close, 2)}</td>
      <td class="${row.change_pct_display >= 0 ? "up" : "down"}">${formatPct(row.change_pct_display)}</td>
      <td>${formatNumber(row.amount_yi, 0)} 亿</td>
      <td>${formatPct(Number(row.turnover_rate || 0) * 100)}</td>
      <td>${formatPct(Number(row.amplitude || 0) * 100)}</td>
      <td>${escapeHtml((row.timeString || "").slice(0, 19))}</td>
      <td class="row-actions">
        <button data-stock-detail="${escapeHtml(row.code)}">详情</button>
        <button data-stock-remove="${escapeHtml(row.code)}">删除</button>
      </td>
    </tr>
  `;
}

function renderTrendRow(code, item) {
  const rows = item.rows || [];
  const recent = rows.slice(-28);
  const path = sparklinePath(recent.map((row) => Number(row.close)));
  const latest = rows[rows.length - 1] || {};
  return `
    <div class="trend-row">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(code)} · 近20日 ${latest.pct20 === null || latest.pct20 === undefined ? "-" : formatPct(latest.pct20)}</span>
      </div>
      <svg viewBox="0 0 180 44" preserveAspectRatio="none">
        <path d="${path.area}" class="spark-area"></path>
        <path d="${path.line}" class="spark-line"></path>
      </svg>
    </div>
  `;
}

async function loadStockDetail(code) {
  showNotice(`正在读取 ${code} 的近一年 K 线...`);
  try {
    const response = await fetch(`/api/a-share/stock/${code}`);
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    renderStockDetail(data);
    showNotice("");
  } catch (error) {
    showNotice(`个股详情加载失败：${error.message}`, true);
  }
}

function renderStockDetail(data) {
  const quote = data.quote || {};
  const history = data.history || [];
  document.getElementById("stockDetailTitle").textContent = `${quote.name || quote.code || "个股"} · ${quote.code || ""}`;
  document.getElementById("stockDetailSubtitle").textContent = `${data.source} · ${quote.timeString || data.generated_at || "-"}`;
  document.getElementById("stockSignals").innerHTML = (data.signals || []).map((item) => `<div>${escapeHtml(item)}</div>`).join("");
  const recent = history.slice(-80);
  const path = sparklinePath(recent.map((row) => Number(row.close)), 640, 180);
  const latestRows = history.slice(-10).reverse();
  document.getElementById("stockTrend").innerHTML = `
    <svg viewBox="0 0 640 180" preserveAspectRatio="none">
      <path d="${path.area}" class="spark-area"></path>
      <path d="${path.line}" class="spark-line"></path>
    </svg>
    <div class="table-wrap compact">
      <table class="data-table">
        <thead><tr><th>日期</th><th>收盘</th><th>MA5</th><th>MA20</th><th>20日涨跌</th><th>成交额</th></tr></thead>
        <tbody>
          ${latestRows
            .map(
              (row) => `
              <tr>
                <td>${escapeHtml(row.date)}</td>
                <td>${formatNumber(row.close, 2)}</td>
                <td>${row.ma5 === null ? "-" : formatNumber(row.ma5, 2)}</td>
                <td>${row.ma20 === null ? "-" : formatNumber(row.ma20, 2)}</td>
                <td class="${Number(row.pct20 || 0) >= 0 ? "up" : "down"}">${row.pct20 === null ? "-" : formatPct(row.pct20)}</td>
                <td>${formatNumber(row.amount_yi, 0)} 亿</td>
              </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderBriefBlock(block) {
  if (block.type === "table") {
    const rows = block.rows || [];
    if (!rows.length) return "";
    const header = rows[0] || [];
    const body = rows.slice(1);
    return `
      <div class="brief-table-wrap">
        <table class="brief-table">
          <thead><tr>${header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead>
          <tbody>
            ${body.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </div>
    `;
  }
  const text = block.text || "";
  const isBullet = block.style && block.style.includes("Bullet");
  return isBullet ? `<p class="brief-bullet">${escapeHtml(text)}</p>` : `<p>${escapeHtml(text)}</p>`;
}

function renderHeatmap(payload) {
  state.lastPayload = payload;
  const categories = payload.categories || [];
  const dates = payload.dates || [];
  const data = payload.data || {};
  const children = payload.children || {};
  heatmap.style.setProperty("--date-count", String(Math.max(dates.length, 1)));
  document.getElementById("rangeLabel").textContent = dates.length ? `${dates[0]} 至 ${dates[dates.length - 1]} · ${dates.length} 个交易日` : "-";

  const parts = ['<div></div>'];
  dates.forEach((date) => {
    parts.push(`<div class="date-label">${formatDate(date)}</div>`);
  });

  categories.forEach((category) => {
    const childRows = children[category] || {};
    const childCount = Object.keys(childRows).length;
    const expanded = state.expanded.has(category);
    parts.push(
      `<button class="row-label parent-row" data-category="${escapeHtml(category)}" title="点击展开/收起二级行业">
        <span class="caret">${childCount ? (expanded ? "−" : "+") : ""}</span>
        <span>${escapeHtml(category)}</span>
      </button>`,
    );
    const values = data[category] || [];
    dates.forEach((date, index) => {
      const value = values[index];
      const label = value === null || value === undefined ? "-" : Number(value).toFixed(0);
      parts.push(
        `<div class="cell" title="${escapeHtml(category)} ${date}: ${label}" style="background:${colorFor(value)}">${label}</div>`,
      );
    });

    if (expanded) {
      Object.entries(childRows).forEach(([industry, childValues]) => {
        parts.push(`<div class="row-label child-row">${escapeHtml(industry)}</div>`);
        dates.forEach((date, index) => {
          const value = childValues[index];
          const label = value === null || value === undefined ? "-" : Number(value).toFixed(0);
          parts.push(
            `<div class="cell child-cell" title="${escapeHtml(industry)} ${date}: ${label}" style="background:${colorFor(value)}">${label}</div>`,
          );
        });
      });
    }
  });

  heatmap.innerHTML = parts.join("");
  heatmap.querySelectorAll(".parent-row").forEach((button) => {
    button.addEventListener("click", () => {
      const category = button.dataset.category;
      if (!category) return;
      if (state.expanded.has(category)) state.expanded.delete(category);
      else state.expanded.add(category);
      renderHeatmap(state.lastPayload);
    });
  });
}

function sparklinePath(values, width = 180, height = 44) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < 2) return { line: "", area: "" };
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const range = max - min || 1;
  const points = clean.map((value, index) => {
    const x = (index / (clean.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 6) - 3;
    return [x, y];
  });
  const line = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  return { line, area };
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return Number(value).toLocaleString("zh-CN", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function formatPct(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(2)}%`;
}

function formatSigned(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return `${Number(value) >= 0 ? "+" : ""}${formatNumber(value, 2)}`;
}

function formatDate(date) {
  return date.slice(5).replace("-", "/");
}

function colorFor(value) {
  if (value === null || value === undefined) return "#eef2f7";
  const stops = [
    [0, [224, 231, 255]],
    [25, [186, 230, 253]],
    [50, [187, 247, 208]],
    [75, [254, 240, 138]],
    [100, [253, 186, 116]],
  ];
  const clamped = Math.max(0, Math.min(100, Number(value)));
  for (let i = 0; i < stops.length - 1; i += 1) {
    const [leftValue, leftColor] = stops[i];
    const [rightValue, rightColor] = stops[i + 1];
    if (clamped >= leftValue && clamped <= rightValue) {
      const ratio = (clamped - leftValue) / (rightValue - leftValue);
      const color = leftColor.map((channel, index) => Math.round(channel + (rightColor[index] - channel) * ratio));
      return `rgb(${color.join(",")})`;
    }
  }
  return "rgb(253,186,116)";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function refresh() {
  refreshBtn.disabled = true;
  refreshBtn.textContent = "刷新中";
  showNotice("正在调用 market-breadth-heatmap skill 抓取数据并生成 PNG，同时更新交互式热力图...");
  try {
    const response = await authFetch("/api/refresh", { method: "POST" });
    if (!response.ok) throw new Error(await response.text());
    const result = await response.json();
    if (result.ok === false) {
      await loadAll();
      showNotice(result.message || "市场宽度刷新暂不可用。", true);
      return;
    }
    delete state.cache["market-breadth"];
    await loadAll();
    showNotice("");
  } catch (error) {
    showNotice(`刷新失败：${error.message}`, true);
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "刷新";
  }
}

async function generateBrief() {
  generateBriefBtn.disabled = true;
  generateBriefBtn.textContent = "生成中";
  showNotice("正在调用 daily-market-brief skill 的本地工作流生成每日行情简报...");
  try {
    const response = await authFetch("/api/daily-brief/generate", { method: "POST" });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    renderDailyBrief(data);
    showNotice("");
  } catch (error) {
    showNotice(`每日行情生成失败：${error.message}`, true);
  } finally {
    generateBriefBtn.disabled = false;
    generateBriefBtn.textContent = "生成简报";
  }
}

async function addWatchItem(event) {
  event.preventDefault();
  const codeInput = document.getElementById("watchCodeInput");
  const nameInput = document.getElementById("watchNameInput");
  const categoryInput = document.getElementById("watchCategoryInput");
  const code = codeInput.value.trim();
  if (!/^\d{6}$/.test(code)) {
    showNotice("添加自选失败：股票代码必须填写 6 位数字，名称请填写在“名称”输入框。", true);
    codeInput.focus();
    return;
  }
  try {
    const response = await authFetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        name: nameInput.value.trim(),
        category: categoryInput.value.trim(),
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    delete state.cache["watchlist"];
    delete state.cache["desk-card:watch"];
    renderWatchlist(data);
    codeInput.value = "";
    nameInput.value = "";
    categoryInput.value = "";
    showNotice("");
  } catch (error) {
    showNotice(`添加自选失败：${error.message}`, true);
  }
}

async function removeWatchItem(code) {
  try {
    const response = await authFetch(`/api/watchlist/${code}`, { method: "DELETE" });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    delete state.cache["watchlist"];
    delete state.cache["desk-card:watch"];
    renderWatchlist(data);
  } catch (error) {
    showNotice(`删除自选失败：${error.message}`, true);
  }
}

document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

refreshBtn.addEventListener("click", refresh);
generateBriefBtn.addEventListener("click", generateBrief);
refreshIndicesBtn.addEventListener("click", () => loadIndices(true).catch((error) => showNotice(`A股指数加载失败：${error.message}`, true)));
refreshSentimentBtn.addEventListener("click", () => loadSentiment(true).catch((error) => showNotice(`市场情绪加载失败：${error.message}`, true)));
refreshWatchlistBtn.addEventListener("click", () => loadWatchlist(true).catch((error) => showNotice(`自选观察加载失败：${error.message}`, true)));
refreshDataCenterBtn.addEventListener("click", () => loadDataCenter(true).catch((error) => showNotice(`本地数据中心加载失败：${error.message}`, true)));
refreshCrossMarketBtn.addEventListener("click", () => loadCrossMarket(true).catch((error) => showNotice(`跨市场风险加载失败：${error.message}`, true)));
refreshSectorFundsBtn.addEventListener("click", () => loadSectorFunds(state.fundKind, true).catch((error) => showNotice(`板块资金加载失败：${error.message}`, true)));
refreshFundMainlineBtn.addEventListener("click", () => loadFundMainline(state.fundKind, true).catch((error) => showNotice(`资金主线加载失败：${error.message}`, true)));
refreshMacroBtn.addEventListener("click", () => loadMacro(true).catch((error) => showNotice(`宏观商品加载失败：${error.message}`, true)));
refreshDataBtn.addEventListener("click", refreshData);
document.querySelectorAll(".fund-tab").forEach((button) => {
  button.addEventListener("click", () => loadSectorFunds(button.dataset.fundKind, false).catch((error) => showNotice(`板块资金加载失败：${error.message}`, true)));
});
watchlistForm.addEventListener("submit", addWatchItem);
fullscreenBtn.addEventListener("click", () => modal.classList.remove("hidden"));
previewBtn.addEventListener("click", () => modal.classList.remove("hidden"));
document.getElementById("closeModal").addEventListener("click", () => modal.classList.add("hidden"));
modal.addEventListener("click", (event) => {
  if (event.target === modal) modal.classList.add("hidden");
});

loadDesk(false).catch((error) => showNotice(`早盘驾驶舱加载失败：${error.message}`, true));
loadAll().catch((error) => showNotice(`市场宽度预加载失败：${error.message}`, true));
