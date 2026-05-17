CREATE DATABASE IF NOT EXISTS market_data
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE market_data;

CREATE TABLE IF NOT EXISTS daily_data (
  date DATE NOT NULL,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(128) NOT NULL,
  market VARCHAR(32) NOT NULL,
  close DECIMAL(20, 6) NULL,
  `change` DECIMAL(20, 6) NULL,
  change_pct DECIMAL(20, 6) NULL,
  volume DECIMAL(28, 4) NULL,
  amount DECIMAL(28, 4) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (date, code, market),
  KEY idx_daily_data_market_date (market, date),
  KEY idx_daily_data_code_date (code, date),
  KEY idx_daily_data_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
