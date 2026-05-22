#!/usr/bin/env python3
"""
市场宽度热力图生成脚本

用法:
  python3 generate.py --mode fetch [--output raw_data.json]
  python3 generate.py --mode aggregate --input raw_data.json --output aggregated_data.json
  python3 generate.py --mode render --input aggregated_data.json --template heatmap_template.html --output result.html
  python3 generate.py --mode all [--output-dir ./]
"""

import argparse
import json
import os
import sys
import urllib.request
from collections import defaultdict

# ── 行业映射表 ──────────────────────────────────────────────
INDUSTRY_CATEGORY_MAP = {
    "有色金属": "有色金属", "小金属": "有色金属", "能源金属": "有色金属", "贵金属": "有色金属",
    "中药": "医药", "化学制药": "医药", "医疗器械": "医药", "医疗服务": "医药",
    "医药商业": "医药", "生物制品": "医药",
    "文化传媒": "传媒", "游戏": "传媒",
    "半导体": "电子", "消费电子": "电子", "光学光电子": "电子", "电子元件": "电子",
    "专用设备": "机械", "仪器仪表": "机械", "工程机械": "机械", "电机": "机械", "通用设备": "机械",
    "通信设备": "通信", "通信服务": "通信",
    "包装材料": "轻工制造", "家用轻工": "轻工制造", "家电行业": "轻工制造", "造纸印刷": "轻工制造",
    "商业百货": "商贸零售", "旅游酒店": "商贸零售", "珠宝首饰": "商贸零售",
    "美容护理": "商贸零售", "贸易行业": "商贸零售",
    "汽车整车": "汽车", "汽车服务": "汽车", "汽车零部件": "汽车",
    "交运设备": "交通运输", "物流行业": "交通运输", "航空机场": "交通运输",
    "航运港口": "交通运输", "铁路公路": "交通运输",
    "银行": "银行",
    "农药兽药": "化工", "化学制品": "化工", "化学原料": "化工", "化纤行业": "化工",
    "化肥行业": "化工", "塑料制品": "化工", "橡胶制品": "化工",
    "电子化学品": "化工", "非金属材料": "化工",
    "纺织服装": "纺织服装",
    "互联网服务": "计算机", "计算机设备": "计算机", "软件开发": "计算机",
    "工程咨询服务": "建筑", "工程建设": "建筑", "水泥建材": "建筑",
    "玻璃玻纤": "建筑", "装修建材": "建筑", "装修装饰": "建筑",
    "酿酒行业": "食品饮料", "食品饮料": "食品饮料",
    "钢铁行业": "钢铁",
    "专业服务": "综合", "综合行业": "综合", "教育": "综合",
    "农牧饲渔": "农林牧渔",
    "证券": "金融", "保险": "金融", "多元金融": "金融",
    "石油行业": "石油",
    "航天航空": "国防军工", "船舶制造": "国防军工",
    "光伏设备": "电力", "电池": "电力", "电源设备": "电力",
    "电网设备": "电力", "风电设备": "电力", "电力行业": "电力",
    "房地产开发": "房地产", "房地产服务": "房地产",
    "公用事业": "公用事业", "燃气": "公用事业", "环保行业": "公用事业",
    "煤炭行业": "煤炭", "采掘行业": "煤炭",
}

API_URL = "https://sckd.dapanyuntu.com/api/api/industry_ma20_analysis_page?page=0"


def fetch_data(output_path):
    """Step 1: 从 API 获取原始数据"""
    print(f"正在获取数据: {API_URL}")
    req = urllib.request.Request(API_URL, headers={
        "Referer": "https://sckd.dapanyuntu.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"已保存原始数据: {output_path}")
    print(f"  行业数: {len(data['industries'])}, 日期数: {len(data['dates'])}, 数据点: {len(data['data'])}")
    return data


def aggregate_data(input_path, output_path):
    """Step 2: 按一级行业聚合"""
    with open(input_path, encoding="utf-8") as f:
        raw = json.load(f)
    industries = raw["industries"]
    dates = raw["dates"]
    data = raw["data"]

    unmapped = [ind for ind in industries if ind not in INDUSTRY_CATEGORY_MAP]
    if unmapped:
        print(f"警告: {len(unmapped)} 个行业未映射: {unmapped}")

    cat_date_vals = defaultdict(lambda: defaultdict(list))
    for date_idx, ind_idx, val in data:
        ind = industries[ind_idx]
        cat = INDUSTRY_CATEGORY_MAP.get(ind)
        if cat:
            cat_date_vals[cat][date_idx].append(val)

    cat_avg = {}
    for cat, date_vals in cat_date_vals.items():
        cat_avg[cat] = {}
        for date_idx, vals in date_vals.items():
            valid = [v for v in vals if v > 0]
            cat_avg[cat][date_idx] = round(sum(valid) / len(valid), 1) if valid else None

    latest_col = len(dates) - 1
    sorted_cats = sorted(cat_avg.keys(), key=lambda c: cat_avg[c].get(latest_col, 0) or 0, reverse=True)

    output = {
        "categories": sorted_cats,
        "dates": dates,
        "data": {cat: [cat_avg[cat].get(i) for i in range(len(dates))] for cat in sorted_cats}
    }
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"已保存聚合数据: {output_path}")
    print(f"  一级行业: {len(sorted_cats)}, 日期: {len(dates)}")
    return output


def render_html(input_path, template_path, output_path):
    """Step 3: 注入数据到模板生成 HTML"""
    with open(input_path, encoding="utf-8") as f:
        data = json.load(f)
    with open(template_path, encoding="utf-8") as f:
        template = f.read()
    data_str = json.dumps(data, ensure_ascii=False)
    html = template.replace("__DATA__", data_str)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"已生成热力图: {output_path}")
    print(f"  文件大小: {len(html):,} bytes")
    return output_path


def capture_html(html_path, output_path, width=1080, height=1440, dpr=2):
    """Step 4: 使用 Playwright 将 HTML 转换为 PNG（2x 高清）"""
    import subprocess
    skill_base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    capture_js = os.path.join(skill_base, "assets", "capture.js")
    
    if not os.path.exists(capture_js):
        print(f"错误: capture.js 不存在 {capture_js}")
        print("请运行: npm install && npx playwright install chromium")
        return None
    
    print(f"正在截图: {html_path} -> {output_path} ({width}x{height}, {dpr}x DPR)")
    cmd = [
        "node", capture_js,
        html_path, output_path, str(width), str(height), str(dpr)
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=skill_base)
    
    if result.returncode != 0:
        print(f"截图失败: {result.stderr}")
        return None
    
    print(f"已生成 PNG: {output_path}")
    print(f"  尺寸: {width}x{height}")
    return output_path


def main():
    parser = argparse.ArgumentParser(description="市场宽度热力图生成工具")
    parser.add_argument("--mode", required=True, choices=["fetch", "aggregate", "render", "capture", "all"])
    parser.add_argument("--input", help="输入文件路径")
    parser.add_argument("--output", help="输出文件路径")
    parser.add_argument("--template", help="HTML 模板路径")
    parser.add_argument("--output-dir", default="./", help="all 模式的输出目录")
    parser.add_argument("--width", type=int, default=1080, help="PNG 输出宽度（默认 1080）")
    parser.add_argument("--height", type=int, default=1440, help="PNG 输出高度（默认 1440）")
    args = parser.parse_args()

    if args.mode == "fetch":
        output = args.output or os.path.join(args.output_dir, "raw_data.json")
        fetch_data(output)
    elif args.mode == "aggregate":
        if not args.input:
            print("错误: --aggregate 模式需要 --input 参数"); sys.exit(1)
        output = args.output or os.path.join(args.output_dir, "aggregated_data.json")
        aggregate_data(args.input, output)
    elif args.mode == "render":
        if not args.input or not args.template:
            print("错误: --render 模式需要 --input 和 --template 参数"); sys.exit(1)
        output = args.output or os.path.join(args.output_dir, "market_breadth_heatmap.html")
        render_html(args.input, args.template, output)
    elif args.mode == "capture":
        if not args.input:
            print("错误: --capture 模式需要 --input 参数"); sys.exit(1)
        output = args.output or os.path.join(args.output_dir, "market_breadth_heatmap.png")
        capture_html(args.input, output, args.width, args.height)
    elif args.mode == "all":
        skill_base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        template = os.path.join(skill_base, "assets", "heatmap_template.html")
        raw_path = os.path.join(args.output_dir, "raw_data.json")
        agg_path = os.path.join(args.output_dir, "aggregated_data.json")
        html_path = os.path.join(args.output_dir, "market_breadth_heatmap.html")
        png_path = os.path.join(args.output_dir, "market_breadth_heatmap.png")
        if not os.path.exists(template):
            print(f"错误: 模板不存在 {template}"); sys.exit(1)
        fetch_data(raw_path)
        aggregate_data(raw_path, agg_path)
        render_html(agg_path, template, html_path)
        capture_html(html_path, png_path, args.width, args.height)
        print(f"\n完成! PNG 热力图已生成: {png_path}")


if __name__ == "__main__":
    main()
