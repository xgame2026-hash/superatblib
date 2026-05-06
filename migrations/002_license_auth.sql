CREATE TABLE IF NOT EXISTS license_codes (
  code_hash CHAR(64) NOT NULL,
  plan VARCHAR(64) NOT NULL DEFAULT 'standard',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  max_activations INT UNSIGNED NOT NULL DEFAULT 1,
  expires_at DATETIME NULL,
  features JSON NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (code_hash),
  KEY idx_license_codes_status (status),
  KEY idx_license_codes_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS license_activations (
  activation_id CHAR(64) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  device_id VARCHAR(160) NOT NULL,
  device_name VARCHAR(160) NULL,
  token_hash CHAR(64) NULL,
  activated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  PRIMARY KEY (activation_id),
  UNIQUE KEY uniq_license_activation_device (code_hash, device_id),
  KEY idx_license_activations_code (code_hash),
  KEY idx_license_activations_token (token_hash),
  CONSTRAINT fk_license_activations_code
    FOREIGN KEY (code_hash) REFERENCES license_codes (code_hash)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS license_audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code_hash CHAR(64) NULL,
  activation_id CHAR(64) NULL,
  action VARCHAR(64) NOT NULL,
  detail_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_license_audit_code (code_hash),
  KEY idx_license_audit_activation (activation_id),
  KEY idx_license_audit_action (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
