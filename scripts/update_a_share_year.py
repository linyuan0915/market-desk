from __future__ import annotations

import argparse
import json
import os
import time
from datetime import date, timedelta

import pymysql
import requests


RSSCAST_URL = "https://app-cn.rsscast.io/api/mcp/v1/mcp"
DB_NAME = "market_data"


def main() -> None:
    parser = argparse.ArgumentParser(description="Use RssCast MCP to backfill local A-share daily data slowly.")
    parser.add_argument("--days", type=int, default=365)
    parser.add_argument("--batch-size", type=int, default=5)
    parser.add_argument("--sleep", type=float, default=2.0)
    parser.add_argument("--limit", type=int, default=0, help="Limit symbols for a test run. 0 means all local A-share stocks.")
    args = parser.parse_args()

    token = os.environ.get("RSSCAST_MCP_TOKEN")
    if not token:
        raise SystemExit("RSSCAST_MCP_TOKEN is required.")

    end_date = date.today()
    start_date = end_date - timedelta(days=args.days)
    connection = pymysql.connect(host="127.0.0.1", user="root", database=DB_NAME, charset="utf8mb4")
    try:
        symbols = load_local_a_share_symbols(connection)
        if args.limit:
            symbols = symbols[: args.limit]
        print(f"Backfilling {len(symbols)} A-share symbols from {start_date} to {end_date}.")
        for index in range(0, len(symbols), args.batch_size):
            batch_symbols = symbols[index : index + args.batch_size]
            batch = [item["plain_code"] for item in batch_symbols]
            suffix_map = {item["plain_code"]: item["code"] for item in batch_symbols}
            name_map = {item["plain_code"]: item["name"] or item["code"] for item in batch_symbols}
            rows = rsscast_call(
                token,
                "StockKLineQuery",
                {"codes": batch, "startDate": start_date.isoformat(), "endDate": end_date.isoformat()},
            )
            inserted = upsert_rows(connection, rows, suffix_map, name_map)
            print(f"{index + len(batch):>4}/{len(symbols)} symbols, {inserted:>5} rows upserted, batch={','.join(batch)}")
            time.sleep(args.sleep)
    finally:
        connection.close()


def load_local_a_share_symbols(connection) -> list[dict]:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                code,
                MAX(name) AS name,
                REPLACE(REPLACE(code, '.SS', ''), '.SZ', '') AS plain_code
            FROM daily_data
            WHERE market = 'A股个股'
              AND code LIKE '%.%'
            GROUP BY code, plain_code
            ORDER BY plain_code
            """
        )
        return [{"code": row[0], "name": row[1], "plain_code": row[2]} for row in cursor.fetchall() if row[2]]


def rsscast_call(token: str, tool: str, arguments: dict) -> list[dict]:
    payload = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": arguments}}
    response = requests.post(
        RSSCAST_URL,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        },
        json=payload,
        timeout=60,
    )
    response.raise_for_status()
    message = parse_mcp_sse(response.text)
    if "error" in message:
        raise RuntimeError(message["error"])
    content = message.get("result", {}).get("content", [])
    if not content:
        return []
    return json.loads(content[0].get("text", "[]"))


def parse_mcp_sse(text: str) -> dict:
    for line in text.splitlines():
        if line.startswith("data:"):
            return json.loads(line.removeprefix("data:").strip())
    return json.loads(text)


def upsert_rows(connection, rows: list[dict], suffix_map: dict[str, str], name_map: dict[str, str]) -> int:
    if not rows:
        return 0
    rows = sorted(rows, key=lambda item: (str(item.get("code") or ""), str(item.get("timeString") or "")))
    previous_close_by_code: dict[str, float] = {}
    values = []
    for row in rows:
        code = str(row.get("code") or "")
        db_code = suffix_map.get(code, code)
        trade_date = str(row.get("timeString") or "")[:10]
        if not code or not trade_date:
            continue
        close = row.get("close")
        previous_close = previous_close_by_code.get(code)
        change_amount = row.get("change_amount")
        change_pct = row.get("change_pct")
        if close is not None and previous_close:
            if change_amount is None:
                change_amount = float(close) - previous_close
            if change_pct is None:
                change_pct = (float(close) / previous_close - 1) * 100
        if close is not None:
            previous_close_by_code[code] = float(close)
        values.append(
            (
                trade_date,
                db_code,
                name_map.get(code) or row.get("name") or db_code,
                "A股个股",
                close,
                change_amount,
                change_pct,
                row.get("volume"),
                row.get("amount"),
            )
        )
    if not values:
        return 0
    with connection.cursor() as cursor:
        cursor.executemany(
            """
            INSERT INTO daily_data (date, code, name, market, close, `change`, change_pct, volume, amount)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                close = VALUES(close),
                `change` = VALUES(`change`),
                change_pct = VALUES(change_pct),
                volume = VALUES(volume),
                amount = VALUES(amount)
            """,
            values,
        )
    connection.commit()
    return len(values)


if __name__ == "__main__":
    main()
