use axum::{
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use base64::engine::{general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{DateTime, Utc};
use rand::RngCore;
use reqwest::Client as HttpClient;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{env, net::SocketAddr, sync::Arc, time::Duration};
use tokio_postgres::{Client, NoTls, Row};
use tower_http::cors::CorsLayer;

const VERSION: &str = "1.6.3";
const REQUIRED_LIQ2_PROTOCOL_VERSION: &str = "liq2-cutover-20260624-v160";
const DEFAULT_RPC_PLAN_API_URL: &str = "https://supermtnode.io/api/rpc";

#[derive(Clone)]
struct AppState {
    database_url: String,
    lease_seconds: i32,
    access_token_bytes: usize,
    offline_logout_minutes: i32,
    balance_refresh_seconds: i64,
    balance_refresh_batch_size: i64,
    balance_rpc_timeout_ms: u64,
    http: HttpClient,
}

struct LicenseInfo {
    id: String,
    expires_at: String,
    status: String,
    starts_at: String,
    remaining_units: String,
}

#[derive(Debug)]
struct ApiError {
    status: StatusCode,
    code: &'static str,
    message: String,
}

impl ApiError {
    fn bad_request(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            code,
            message: message.into(),
        }
    }

    fn unauthorized(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::UNAUTHORIZED,
            code,
            message: message.into(),
        }
    }

    fn payment_required(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::PAYMENT_REQUIRED,
            code,
            message: message.into(),
        }
    }

    fn internal(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code: "INTERNAL",
            message: message.into(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(json!({ "ok": false, "code": self.code, "message": self.message })),
        )
            .into_response()
    }
}

type ApiResult<T> = Result<T, ApiError>;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoginRequest {
    wallet_address: String,
    token: String,
    #[serde(default)]
    auth_code: Option<String>,
    #[serde(default)]
    app_token: Option<String>,
    #[serde(default)]
    auth_identity: Option<String>,
    #[serde(default)]
    device_id: String,
    #[serde(default)]
    system_id: Option<String>,
    #[serde(default)]
    encrypted_public_key: Option<String>,
    #[serde(default)]
    wallet_public_key: Option<String>,
    #[serde(default)]
    public_key: Option<String>,
    #[serde(default)]
    private_key_encrypted_public_key: Option<String>,
    #[serde(flatten)]
    extra: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct QueueRequest {
    #[serde(default)]
    action: Option<String>,
    #[serde(default)]
    chain: Option<String>,
    #[serde(default)]
    wallet_address: Option<String>,
    #[serde(default)]
    wallet: Option<Value>,
    #[serde(default)]
    queue_id: Option<String>,
    #[serde(default)]
    queue_member_key: Option<String>,
    #[serde(default)]
    dedupe_key: Option<String>,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    participant_id: Option<String>,
    #[serde(default)]
    participant_key: Option<String>,
    #[serde(default)]
    endpoint_slug: Option<String>,
    #[serde(default)]
    market: Option<String>,
    #[serde(default)]
    start_intent_id: Option<String>,
    #[serde(default)]
    expires_at: Option<String>,
    #[serde(default)]
    encrypted_public_key: Option<String>,
    #[serde(default)]
    wallet_public_key: Option<String>,
    #[serde(flatten)]
    extra: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Liq2WalletBootstrapRequest {
    #[serde(default)]
    system_id: Option<String>,
    #[serde(default)]
    chain: Option<String>,
    #[serde(default)]
    wallet_address: Option<String>,
    #[serde(default)]
    wallet: Option<Value>,
    #[serde(default)]
    status: Option<String>,
    #[serde(flatten)]
    extra: Value,
}

#[derive(Deserialize)]
struct LeaderboardQuery {
    chain: Option<String>,
    limit: Option<i64>,
    #[serde(rename = "includeOffline")]
    include_offline: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LoginResponse {
    ok: bool,
    access_token: String,
    session_id: String,
    license_id: String,
    lease_expires_at: String,
    heartbeat_seconds: i32,
    remaining_units: String,
    expires_at: String,
}

#[derive(Clone)]
struct SessionInfo {
    session_id: String,
    license_id: String,
    user_id: Option<String>,
    wallet_address: String,
}

struct BillingCharge {
    units: i64,
    seconds: i64,
    remaining_units: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::from_path("/opt/supermt-state/.env").ok();
    let state = Arc::new(AppState {
        database_url: env::var("STATE_DATABASE_URL")?,
        lease_seconds: env::var("SESSION_LEASE_SECONDS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(90),
        access_token_bytes: env::var("ACCESS_TOKEN_BYTES")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(32),
        offline_logout_minutes: env::var("OFFLINE_LOGOUT_MINUTES")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(5),
        balance_refresh_seconds: env::var("LEADERBOARD_BALANCE_REFRESH_SECONDS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(300),
        balance_refresh_batch_size: env::var("LEADERBOARD_BALANCE_REFRESH_BATCH_SIZE")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(25),
        balance_rpc_timeout_ms: env::var("LEADERBOARD_BALANCE_RPC_TIMEOUT_MS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(4_000),
        http: HttpClient::new(),
    });
    spawn_balance_refresh_loop(state.clone());

    let port: u16 = env::var("STATE_API_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(8790);
    let app = Router::new()
        .route("/health", get(health))
        .route("/v1/health", get(health))
        .route("/v1/auth/login", post(login))
        .route("/v1/auth/heartbeat", post(auth_heartbeat))
        .route("/v1/auth/logout", post(auth_logout))
        .route("/v1/queue/status", post(queue_status))
        .route("/v1/leaderboard", get(leaderboard))
        .route("/v1/rpc", post(rpc_not_available))
        .route(
            "/api/internal/liq2-wallet/bootstrap",
            post(liq2_wallet_bootstrap),
        )
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn db(state: &AppState) -> ApiResult<Client> {
    let (client, connection) = tokio_postgres::connect(&state.database_url, NoTls)
        .await
        .map_err(|err| ApiError::internal(format!("DB connect failed: {err}")))?;
    tokio::spawn(async move {
        if let Err(err) = connection.await {
            eprintln!("postgres connection error: {err}");
        }
    });
    Ok(client)
}

async fn health(State(state): State<Arc<AppState>>) -> ApiResult<Json<Value>> {
    let client = db(&state).await?;
    client
        .query_one("SELECT 1", &[])
        .await
        .map_err(|err| ApiError::internal(format!("DB health failed: {err}")))?;
    Ok(Json(
        json!({ "ok": true, "version": VERSION, "db": true, "service": "supermt-state-api-rust" }),
    ))
}

async fn login(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<LoginRequest>,
) -> ApiResult<Json<LoginResponse>> {
    require_cutover_protocol(&body.extra)?;
    let wallet = normalize_wallet(&body.wallet_address)?;
    let token_value = first_string(&[
        Some(body.token.as_str()),
        body.app_token.as_deref(),
        body.auth_identity.as_deref(),
    ])
    .unwrap_or_default();
    let token = non_empty(&token_value, "token")?;
    let token_hash = sha256_hex(token);
    let submitted_auth_code = first_string(&[body.auth_code.as_deref()])
        .or_else(|| string_field(&body.extra, "authCode"))
        .or_else(|| string_field(&body.extra, "auth_code"));
    let auth_code_hash = submitted_auth_code.as_deref().map(sha256_hex);
    let access_token = random_token(state.access_token_bytes);
    let access_hash = sha256_hex(&access_token);
    let device_id = if body.device_id.trim().is_empty() {
        "default-device".to_string()
    } else {
        body.device_id.trim().chars().take(160).collect()
    };
    let encrypted_public_key = first_string(&[
        body.encrypted_public_key.as_deref(),
        body.wallet_public_key.as_deref(),
        body.public_key.as_deref(),
        body.private_key_encrypted_public_key.as_deref(),
    ]);
    let runtime = RuntimeSettings::from_value(&body.extra);
    let mut metadata = queue_metadata(&body.extra);
    let submitted_system_id = body
        .system_id
        .clone()
        .or_else(|| string_field(&body.extra, "systemId"));
    let chain = normalize_chain(string_field(&body.extra, "chain").as_deref());
    let system_id = submitted_system_id.unwrap_or_else(|| build_system_id(&chain, &wallet));
    if !system_id.is_empty() {
        metadata["systemId"] = json!(system_id);
        metadata["system_id"] = json!(system_id);
    }
    let user_agent = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    let lease_seconds = f64::from(state.lease_seconds);
    let mut client = db(&state).await?;
    let tx = client
        .transaction()
        .await
        .map_err(|err| db_error_at("login begin", err))?;

    let license_row = tx
        .query_opt(
            r#"
        SELECT
          l.id::text,
          l.expires_at::text,
          l.status::text,
          l.starts_at::text,
          COALESCE((c.total_units - c.used_units - c.reserved_units)::text, '0') AS remaining_units
        FROM licenses l
        LEFT JOIN rpc_credits c ON c.license_id = l.id
        WHERE l.token_hash = $1 OR ($2::text IS NOT NULL AND l.auth_code_hash = $2)
        ORDER BY CASE WHEN l.token_hash = $1 THEN 0 ELSE 1 END
        LIMIT 1
        "#,
            &[&token_hash, &auth_code_hash],
        )
        .await
        .map_err(|err| db_error_at("login read license", err))?;
    let license = match license_row {
        Some(row) => LicenseInfo {
            id: row.get(0),
            expires_at: row.get(1),
            status: row.get(2),
            starts_at: row.get(3),
            remaining_units: row.get(4),
        },
        None => provision_client_license(&tx, &token_hash, auth_code_hash.as_deref()).await?,
    };
    let license_id = license.id;
    let license_expires_at = license.expires_at;
    let license_status = license.status;
    let license_starts_at = license.starts_at;
    let remaining_units = license.remaining_units;
    if license_status != "active" {
        return Err(ApiError::payment_required(
            "TOKEN_NOT_ACTIVE",
            "Token is not active",
        ));
    }
    if parse_time(&license_starts_at)? > Utc::now() {
        return Err(ApiError::payment_required(
            "TOKEN_NOT_STARTED",
            "Token is not active yet",
        ));
    }
    if parse_time(&license_expires_at)? <= Utc::now() {
        return Err(ApiError::payment_required("TOKEN_EXPIRED", "Token expired"));
    }
    let user_row = tx.query_one(
        r#"
        INSERT INTO users (wallet_address, encrypted_public_key)
        VALUES ($1, $2)
        ON CONFLICT (wallet_address) DO UPDATE
          SET encrypted_public_key = COALESCE(EXCLUDED.encrypted_public_key, users.encrypted_public_key),
              updated_at = now()
        RETURNING id::text
        "#,
        &[&wallet, &encrypted_public_key],
    ).await.map_err(|err| db_error_at("login upsert user", err))?;
    let user_id: String = user_row.get(0);

    tx.execute(
        "UPDATE licenses SET user_id = COALESCE(user_id, $1::text::uuid) WHERE id = $2::text::uuid",
        &[&user_id, &license_id],
    )
    .await
    .map_err(|err| db_error_at("login bind user license", err))?;
    upsert_user_wallet(
        &tx,
        Some(&user_id),
        &license_id,
        &wallet,
        &system_id,
        encrypted_public_key.as_deref(),
        encrypted_private_key(&body.extra).as_deref(),
        "online",
        &metadata,
        true,
    )
    .await?;
    upsert_runtime_settings(&tx, &license_id, &wallet, &runtime, &metadata).await?;
    upsert_liq2_user_profile(
        &tx,
        Liq2ProfileUpsert {
            system_id: &system_id,
            chain: &chain,
            wallet: &wallet,
            rpc_url: rpc_url(&body.extra),
            rpc_token: rpc_token(&body.extra).or_else(|| Some(token.to_string())),
            runtime: &runtime,
            encrypted_private_key: encrypted_private_key(&body.extra).as_deref(),
            status: "online",
            wallet_usdt: wallet_usdt(&body.extra),
            nickname: nickname(&body.extra),
        },
    )
    .await?;

    let session_row = tx.query_one(
        r#"
        INSERT INTO sessions (license_id, wallet_address, device_id, access_token_hash, status, user_agent, lease_expires_at, metadata)
        VALUES ($1::text::uuid, $2, $3, $4, 'online', $5, now() + make_interval(secs => $6), $7::text::jsonb)
        ON CONFLICT (license_id, device_id) DO UPDATE
          SET wallet_address = EXCLUDED.wallet_address,
              access_token_hash = EXCLUDED.access_token_hash,
              status = 'online',
              user_agent = EXCLUDED.user_agent,
              connected_at = now(),
              last_heartbeat_at = now(),
              lease_expires_at = now() + make_interval(secs => $6),
              metadata = sessions.metadata || EXCLUDED.metadata,
              disconnected_at = NULL
        RETURNING id::text, lease_expires_at::text
        "#,
        &[&license_id, &wallet, &device_id, &access_hash, &user_agent, &lease_seconds, &metadata.to_string()],
    ).await.map_err(|err| db_error_at("login upsert session", err))?;
    let session_id: String = session_row.get(0);
    let lease_expires_at: String = session_row.get(1);

    tx.commit()
        .await
        .map_err(|err| db_error_at("login commit", err))?;
    Ok(Json(LoginResponse {
        ok: true,
        access_token,
        session_id,
        license_id,
        lease_expires_at,
        heartbeat_seconds: 15,
        remaining_units,
        expires_at: license_expires_at,
    }))
}

async fn provision_client_license(
    tx: &tokio_postgres::Transaction<'_>,
    token_hash: &str,
    auth_code_hash: Option<&str>,
) -> ApiResult<LicenseInfo> {
    let auth_hash = auth_code_hash
        .filter(|v| !v.trim().is_empty())
        .unwrap_or(token_hash);
    let row = tx
        .query_one(
            r#"
        INSERT INTO licenses (auth_code_hash, token_hash, expires_at)
        VALUES ($1, $2, now() + interval '10 years')
        ON CONFLICT (token_hash) DO UPDATE
          SET updated_at = now()
        RETURNING id::text, expires_at::text, status::text, starts_at::text
        "#,
            &[&auth_hash, &token_hash],
        )
        .await
        .map_err(|err| db_error_at("login provision license", err))?;
    let license_id: String = row.get(0);
    tx.execute(
        r#"
        INSERT INTO rpc_credits (license_id, total_units, used_units, reserved_units)
        VALUES ($1::text::uuid, 1000000000000, 0, 0)
        ON CONFLICT (license_id) DO NOTHING
        "#,
        &[&license_id],
    )
    .await
    .map_err(|err| db_error_at("login provision credits", err))?;
    Ok(LicenseInfo {
        id: license_id,
        expires_at: row.get(1),
        status: row.get(2),
        starts_at: row.get(3),
        remaining_units: "1000000000000".to_string(),
    })
}

async fn auth_heartbeat(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let token = bearer_token(&headers)
        .ok_or_else(|| ApiError::unauthorized("UNAUTHORIZED", "Missing token"))?;
    let client = db(&state).await?;
    let lease_seconds = f64::from(state.lease_seconds);
    let row = client
        .query_opt(
            r#"
        UPDATE sessions
           SET status = 'online',
               last_heartbeat_at = now(),
               lease_expires_at = now() + make_interval(secs => $2),
               updated_at = now()
         WHERE access_token_hash = $1
           AND metadata->>'protocolVersion' = $3
           AND metadata->>'clientVersion' = $4
         RETURNING id::text, lease_expires_at::text
        "#,
            &[
                &sha256_hex(&token),
                &lease_seconds,
                &REQUIRED_LIQ2_PROTOCOL_VERSION,
                &VERSION,
            ],
        )
        .await
        .map_err(db_error)?;
    let row = row.ok_or_else(|| {
        ApiError::unauthorized(
            "LIQ2_UPGRADE_REQUIRED",
            format!("请升级 liq2 到 {VERSION} 后重新登录。旧版本已停用。"),
        )
    })?;
    Ok(Json(
        json!({ "ok": true, "sessionId": row.get::<_, String>(0), "leaseExpiresAt": row.get::<_, String>(1) }),
    ))
}

async fn auth_logout(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let token = bearer_token(&headers)
        .ok_or_else(|| ApiError::unauthorized("UNAUTHORIZED", "Missing token"))?;
    let client = db(&state).await?;
    client.execute(
        "UPDATE sessions SET status = 'logout', disconnected_at = now(), updated_at = now() WHERE access_token_hash = $1",
        &[&sha256_hex(&token)],
    ).await.map_err(db_error)?;
    Ok(Json(json!({ "ok": true })))
}

async fn queue_status(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<QueueRequest>,
) -> ApiResult<Json<Value>> {
    let session = require_session(&state, &headers).await?;
    let action = queue_action(body.action.as_deref());
    require_cutover_protocol(&body.extra)?;
    let stopping = action == "stop";
    let chain = normalize_chain(body.chain.as_deref());
    let wallet = normalize_wallet(
        body.wallet_address
            .as_deref()
            .or_else(|| body.wallet.as_ref().and_then(|v| v.as_str()))
            .unwrap_or(&session.wallet_address),
    )?;
    let encrypted_public_key = first_string(&[
        body.encrypted_public_key.as_deref(),
        body.wallet_public_key.as_deref(),
    ]);
    let runtime = RuntimeSettings::from_value(&body.extra);
    if action == "start"
        && string_field(&body.extra, "startIntentId")
            .or(body.start_intent_id.clone())
            .unwrap_or_default()
            .is_empty()
    {
        return Err(ApiError::bad_request(
            "START_INTENT_REQUIRED",
            "Missing startIntentId",
        ));
    }
    if action == "start"
        && (runtime.rpc_plan_type.is_empty()
            || runtime.rpc_plan_name.is_empty()
            || runtime.credit_burn_per_second <= 0)
    {
        eprintln!(
            "queue start missing runtime fields for wallet {}; continuing with local billing defaults",
            wallet
        );
    }

    let mut metadata = queue_metadata(&body.extra);
    let mut client = db(&state).await?;
    let tx = client.transaction().await.map_err(db_error)?;
    if stopping {
        let metadata_json = metadata.to_string();
        tx.execute(
            "UPDATE user_wallets SET status = 'stopped', last_seen_at = now(), metadata = metadata || $3::text::jsonb WHERE license_id = $1::text::uuid AND wallet_address = $2",
            &[&session.license_id, &wallet, &metadata_json],
        ).await.map_err(|err| db_error_at("queue stop user_wallets", err))?;
        let system_id = build_system_id(&chain, &wallet);
        upsert_liq2_user_profile(
            &tx,
            Liq2ProfileUpsert {
                system_id: &system_id,
                chain: &chain,
                wallet: &wallet,
                rpc_url: rpc_url(&body.extra),
                rpc_token: rpc_token(&body.extra),
                runtime: &runtime,
                encrypted_private_key: encrypted_private_key(&body.extra).as_deref(),
                status: "stopped",
                wallet_usdt: wallet_usdt(&body.extra),
                nickname: nickname(&body.extra),
            },
        )
        .await?;
        tx.execute(
            r#"
            UPDATE leaderboard_current
               SET online = false,
                   status = 'stopped',
                   last_seen_at = now(),
                   expires_at = now(),
                   metadata = metadata || $3::text::jsonb,
                   updated_at = now()
             WHERE chain = $1 AND wallet_address = $2
            "#,
            &[&chain, &wallet, &metadata_json],
        )
        .await
        .map_err(|err| db_error_at("queue stop leaderboard", err))?;
        tx.commit().await.map_err(db_error)?;
        return Ok(Json(
            json!({ "ok": true, "queue": { "chain": chain, "wallet_address": wallet, "online": false, "status": "stopped" } }),
        ));
    }

    let system_id = build_system_id(&chain, &wallet);
    upsert_user_wallet(
        &tx,
        session.user_id.as_deref(),
        &session.license_id,
        &wallet,
        &system_id,
        encrypted_public_key.as_deref(),
        encrypted_private_key(&body.extra).as_deref(),
        "online",
        &metadata,
        action == "start",
    )
    .await?;
    upsert_runtime_settings(&tx, &session.license_id, &wallet, &runtime, &metadata).await?;

    let usdt_balance = tokio::time::timeout(
        Duration::from_millis(state.balance_rpc_timeout_ms),
        read_usdt_balance(&state, &chain, &wallet),
    )
    .await
    .ok()
    .and_then(Result::ok);
    if let Some(balance) = usdt_balance.as_deref() {
        metadata["usdtBalanceRefreshedAt"] = json!(Utc::now().to_rfc3339());
        metadata["usdtBalanceSource"] = json!("state-api-submit");
        metadata["usdtBalance"] = json!(balance);
    }
    let usdt_balance = usdt_balance.unwrap_or_else(|| "0".to_string());
    let billing_charge = charge_queue_rpc_credit(
        &tx,
        &session.license_id,
        &chain,
        &wallet,
        action,
        &runtime,
        &state,
    )
    .await?;
    if let Some(charge) = billing_charge.as_ref() {
        metadata["rpcCreditLastChargedAt"] = json!(Utc::now().to_rfc3339());
        metadata["rpcCreditLastChargedUnits"] = json!(charge.units);
        metadata["rpcCreditLastChargedSeconds"] = json!(charge.seconds);
        metadata["rpcCreditRemainingUnits"] = json!(charge.remaining_units);
    }
    let leaderboard_metadata_json = metadata.to_string();
    let today_delta = "0";
    upsert_liq2_user_profile(
        &tx,
        Liq2ProfileUpsert {
            system_id: &system_id,
            chain: &chain,
            wallet: &wallet,
            rpc_url: rpc_url(&body.extra),
            rpc_token: rpc_token(&body.extra),
            runtime: &runtime,
            encrypted_private_key: encrypted_private_key(&body.extra).as_deref(),
            status: "online",
            wallet_usdt: Some(usdt_balance.as_str()),
            nickname: nickname(&body.extra),
        },
    )
    .await?;
    let queue_id = normalize_queue_id(first_string(&[
        body.queue_id.as_deref(),
        body.queue_member_key.as_deref(),
        body.dedupe_key.as_deref(),
        body.id.as_deref(),
    ]));
    let participant_id = normalize_queue_id(first_string(&[
        body.participant_id.as_deref(),
        body.participant_key.as_deref(),
        queue_id.as_deref(),
    ]));
    let endpoint_slug = body
        .endpoint_slug
        .clone()
        .or_else(|| string_field(&body.extra, "endpointSlug"));
    let market = body
        .market
        .clone()
        .or_else(|| string_field(&body.extra, "market"));
    let expires_at = body
        .expires_at
        .clone()
        .or_else(|| string_field(&body.extra, "expiresAt"));
    let expires_at = expires_at.unwrap_or_else(|| {
        chrono::Utc::now()
            .checked_add_signed(chrono::Duration::minutes(30))
            .unwrap()
            .to_rfc3339()
    });

    let row = tx.query_one(
        r#"
        INSERT INTO leaderboard_current
          (chain, wallet_address, system_id, license_id, session_id, queue_id, participant_id, endpoint_slug, market, usdt_balance, today_delta_usdt, online, status, last_seen_at, expires_at, credit_burn_per_second, metadata, last_billed_at)
        VALUES ($1, $2, $3, $4::text::uuid, $5::text::uuid, $6::text, $7::text, $8::text, $9::text, $10::text::numeric, $11::text::numeric, true, 'online', now(), $12::text::timestamptz, $13, $14::text::jsonb, now())
        ON CONFLICT (chain, wallet_address) DO UPDATE
          SET system_id = EXCLUDED.system_id,
              license_id = EXCLUDED.license_id,
              session_id = EXCLUDED.session_id,
              queue_id = COALESCE(EXCLUDED.queue_id, leaderboard_current.queue_id),
              participant_id = COALESCE(EXCLUDED.participant_id, leaderboard_current.participant_id),
              endpoint_slug = COALESCE(EXCLUDED.endpoint_slug, leaderboard_current.endpoint_slug),
              market = COALESCE(EXCLUDED.market, leaderboard_current.market),
              usdt_balance = EXCLUDED.usdt_balance,
              today_delta_usdt = EXCLUDED.today_delta_usdt,
              online = true,
              status = 'online',
              last_seen_at = now(),
              expires_at = EXCLUDED.expires_at,
              credit_burn_per_second = GREATEST(EXCLUDED.credit_burn_per_second, leaderboard_current.credit_burn_per_second),
              last_billed_at = CASE WHEN $15::boolean THEN now() ELSE leaderboard_current.last_billed_at END,
              metadata = leaderboard_current.metadata || EXCLUDED.metadata,
              updated_at = now()
        RETURNING chain, wallet_address, online, status::text, expires_at::text
        "#,
        &[
            &chain,
            &wallet,
            &system_id,
            &session.license_id,
            &session.session_id,
            &queue_id,
            &participant_id,
            &endpoint_slug,
            &market,
            &usdt_balance,
            &today_delta,
            &expires_at,
            &runtime.credit_burn_per_second,
            &leaderboard_metadata_json,
            &billing_charge.is_some(),
        ],
    ).await.map_err(|err| db_error_at("queue upsert leaderboard", err))?;
    tx.commit()
        .await
        .map_err(|err| db_error_at("queue commit", err))?;
    Ok(Json(json!({
        "ok": true,
        "queue": {
            "chain": row.get::<_, String>(0),
            "wallet_address": row.get::<_, String>(1),
            "online": row.get::<_, bool>(2),
            "status": row.get::<_, String>(3),
            "expires_at": row.get::<_, String>(4),
        }
    })))
}

async fn liq2_wallet_bootstrap(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Liq2WalletBootstrapRequest>,
) -> ApiResult<Json<Value>> {
    require_cutover_protocol(&body.extra)?;
    let chain_value = body
        .chain
        .clone()
        .or_else(|| string_field(&body.extra, "chain"));
    let chain = normalize_chain(chain_value.as_deref());
    let wallet_value = body
        .wallet_address
        .clone()
        .or_else(|| {
            body.wallet
                .as_ref()
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .or_else(|| string_field(&body.extra, "walletAddress"))
        .or_else(|| string_field(&body.extra, "wallet_address"));
    let wallet = normalize_wallet(
        wallet_value
            .as_deref()
            .ok_or_else(|| ApiError::bad_request("BAD_REQUEST", "Missing walletAddress"))?,
    )?;
    let system_id = body
        .system_id
        .clone()
        .or_else(|| string_field(&body.extra, "systemId"))
        .or_else(|| string_field(&body.extra, "system_id"))
        .unwrap_or_else(|| build_system_id(&chain, &wallet));
    let mut runtime = RuntimeSettings::from_value(&body.extra);
    let submitted_rpc_url = rpc_url(&body.extra);
    let submitted_rpc_token = rpc_token(&body.extra);
    if let Some(resolved) =
        resolve_supermtnode_rpc_plan(&state, submitted_rpc_token.as_deref()).await
    {
        runtime.apply_resolved_rpc_plan(&resolved);
    }
    let status_value = body
        .status
        .clone()
        .or_else(|| string_field(&body.extra, "status"));
    let status = normalize_profile_status(status_value.as_deref());

    let mut client = db(&state).await?;
    let tx = client.transaction().await.map_err(db_error)?;
    upsert_liq2_user_profile(
        &tx,
        Liq2ProfileUpsert {
            system_id: &system_id,
            chain: &chain,
            wallet: &wallet,
            rpc_url: submitted_rpc_url,
            rpc_token: submitted_rpc_token,
            runtime: &runtime,
            encrypted_private_key: encrypted_private_key(&body.extra).as_deref(),
            status,
            wallet_usdt: wallet_usdt(&body.extra),
            nickname: nickname(&body.extra),
        },
    )
    .await?;
    tx.commit()
        .await
        .map_err(|err| db_error_at("liq2 bootstrap commit", err))?;
    Ok(Json(json!({
        "ok": true,
        "systemId": system_id,
        "system_id": system_id,
        "walletAddress": wallet,
        "wallet_address": wallet,
        "status": status
    })))
}

async fn leaderboard(
    State(state): State<Arc<AppState>>,
    Query(query): Query<LeaderboardQuery>,
) -> ApiResult<Json<Value>> {
    let chain = normalize_chain(query.chain.as_deref());
    let limit = query.limit.unwrap_or(50).clamp(1, 200);
    let include_offline = query
        .include_offline
        .unwrap_or_default()
        .eq_ignore_ascii_case("true");
    let client = db(&state).await?;
    client
        .execute(
            r#"
        UPDATE leaderboard_current
           SET online = false,
               status = 'offline',
               updated_at = now()
         WHERE online = true
           AND (last_seen_at <= now() - make_interval(mins => $1) OR expires_at <= now())
        "#,
            &[&state.offline_logout_minutes],
        )
        .await
        .map_err(|err| db_error_at("leaderboard mark offline", err))?;
    let rows = client.query(
        r#"
        SELECT
          lc.chain,
          lc.wallet_address::text,
          lc.queue_id,
          lc.participant_id,
          lc.endpoint_slug,
          lc.market,
          lc.usdt_balance::text,
          lc.today_delta_usdt::text,
          lc.online,
          lc.status::text,
          lc.last_seen_at::text,
          lc.expires_at::text,
          lc.credit_burn_per_second,
          wrs.credential_auth_mode,
          wrs.single_trade_auth_amount_usdt::text,
          wrs.arbitrage_intensity,
          wrs.rpc_plan_type,
          wrs.rpc_plan_name,
          left(l.auth_code_hash, 16),
          left(l.token_hash, 16)
        FROM leaderboard_current lc
        JOIN licenses l ON l.id = lc.license_id
        LEFT JOIN users u ON u.id = l.user_id
        LEFT JOIN user_wallets uw ON uw.license_id = lc.license_id AND uw.wallet_address = lc.wallet_address
        LEFT JOIN wallet_runtime_settings wrs ON wrs.license_id = lc.license_id AND wrs.wallet_address = lc.wallet_address
        WHERE lc.chain = $1
          AND lower(COALESCE(uw.metadata->>'leaderboardHidden', uw.metadata->>'leaderboard_hidden', 'false')) NOT IN ('1', 'true', 'yes', 'on')
          AND lower(COALESCE(u.member_tier, uw.metadata->>'memberTier', uw.metadata->>'member_tier', 'normal')) NOT IN ('advanced', 'premium', 'vip', '高级')
          AND ($2::boolean OR (lc.online = true AND lc.last_seen_at > now() - make_interval(mins => $4)))
        ORDER BY lc.usdt_balance DESC, lc.today_delta_usdt DESC, lc.last_seen_at DESC
        LIMIT $3
        "#,
        &[&chain, &include_offline, &limit, &state.offline_logout_minutes],
    ).await.map_err(|err| db_error_at("upsert user_wallets", err))?;
    let wallets: Vec<Value> = rows.into_iter().map(leaderboard_row).collect();
    let refresh_state = state.clone();
    tokio::spawn(async move {
        if let Err(err) = refresh_stale_leaderboard_balances(refresh_state).await {
            eprintln!("leaderboard balance refresh failed: {}", err.message);
        }
    });
    Ok(Json(json!({
        "ok": true,
        "source": "supermt-state-leaderboard-rust",
        "queueTransport": "state",
        "queueParticipantCount": wallets.len(),
        "queueUpdatedAt": Utc::now().to_rfc3339(),
        "queuedWallets": wallets,
    })))
}

async fn rpc_not_available() -> ApiResult<Json<Value>> {
    Err(ApiError::bad_request(
        "RPC_NOT_ENABLED",
        "State RPC is not enabled in Rust state API",
    ))
}

async fn require_session(state: &AppState, headers: &HeaderMap) -> ApiResult<SessionInfo> {
    let token = bearer_token(headers)
        .ok_or_else(|| ApiError::unauthorized("UNAUTHORIZED", "Missing bearer token"))?;
    let client = db(state).await?;
    let row = client
        .query_opt(
            r#"
        SELECT
          s.id::text,
          s.license_id::text,
          l.user_id::text,
          s.wallet_address::text,
          s.status::text,
          s.lease_expires_at::text,
          l.status::text,
          l.expires_at::text,
          (c.total_units - c.used_units - c.reserved_units)::text,
          s.metadata->>'protocolVersion',
          s.metadata->>'clientVersion'
        FROM sessions s
        JOIN licenses l ON l.id = s.license_id
        JOIN rpc_credits c ON c.license_id = l.id
        WHERE s.access_token_hash = $1
        "#,
            &[&sha256_hex(&token)],
        )
        .await
        .map_err(|err| db_error_at("upsert runtime_settings", err))?;
    let row = row.ok_or_else(|| ApiError::unauthorized("INVALID_SESSION", "Invalid session"))?;
    let session_status: String = row.get(4);
    let lease_expires_at: String = row.get(5);
    let license_status: String = row.get(6);
    let expires_at: String = row.get(7);
    let protocol_version: Option<String> = row.get(9);
    let client_version: Option<String> = row.get(10);
    if protocol_version.as_deref() != Some(REQUIRED_LIQ2_PROTOCOL_VERSION)
        || client_version.as_deref() != Some(VERSION)
    {
        return Err(ApiError::unauthorized(
            "LIQ2_UPGRADE_REQUIRED",
            format!("请升级 liq2 到 {VERSION} 后重新登录。旧版本已停用。"),
        ));
    }
    if !matches!(session_status.as_str(), "online" | "recovering")
        || parse_time(&lease_expires_at)? < Utc::now()
    {
        return Err(ApiError::unauthorized("SESSION_EXPIRED", "Session expired"));
    }
    if license_status != "active" {
        return Err(ApiError::payment_required(
            "TOKEN_NOT_ACTIVE",
            "Token is not active",
        ));
    }
    if parse_time(&expires_at)? <= Utc::now() {
        return Err(ApiError::payment_required("TOKEN_EXPIRED", "Token expired"));
    }
    Ok(SessionInfo {
        session_id: row.get(0),
        license_id: row.get(1),
        user_id: row.get(2),
        wallet_address: row.get(3),
    })
}

async fn charge_queue_rpc_credit(
    tx: &tokio_postgres::Transaction<'_>,
    license_id: &str,
    chain: &str,
    wallet: &str,
    action: &str,
    runtime: &RuntimeSettings,
    state: &AppState,
) -> ApiResult<Option<BillingCharge>> {
    let burn_per_second = i64::from(runtime.credit_burn_per_second.max(0));
    if burn_per_second <= 0 {
        return Ok(None);
    }

    let seconds = match action {
        "start" => 1,
        "heartbeat" => {
            let row = tx
                .query_opt(
                    r#"
                    SELECT last_billed_at::text, credit_burn_per_second
                      FROM leaderboard_current
                     WHERE chain = $1 AND wallet_address = $2
                    "#,
                    &[&chain, &wallet],
                )
                .await
                .map_err(|err| db_error_at("billing read last billed", err))?;
            let Some(row) = row else {
                return Ok(Some(
                    debit_rpc_credit(tx, license_id, burn_per_second, 1).await?,
                ));
            };
            let last_billed_at: Option<String> = row.get(0);
            let stored_burn: Option<i32> = row.get(1);
            let stored_burn = stored_burn.unwrap_or(0);
            let effective_burn = i64::from(stored_burn.max(runtime.credit_burn_per_second).max(0));
            if effective_burn <= 0 {
                return Ok(None);
            }
            let Some(last_billed_at) = last_billed_at else {
                return Ok(Some(
                    debit_rpc_credit(tx, license_id, effective_burn, 1).await?,
                ));
            };
            let elapsed = Utc::now()
                .signed_duration_since(parse_time(&last_billed_at)?)
                .num_seconds();
            if elapsed <= 0 {
                return Ok(None);
            }
            let cap = i64::from(state.lease_seconds.max(1))
                .saturating_mul(2)
                .min(300);
            let billable_seconds = elapsed.min(cap).max(1);
            return Ok(Some(
                debit_rpc_credit(
                    tx,
                    license_id,
                    effective_burn.saturating_mul(billable_seconds),
                    billable_seconds,
                )
                .await?,
            ));
        }
        _ => 0,
    };

    if seconds <= 0 {
        return Ok(None);
    }
    Ok(Some(
        debit_rpc_credit(
            tx,
            license_id,
            burn_per_second.saturating_mul(seconds),
            seconds,
        )
        .await?,
    ))
}

async fn debit_rpc_credit(
    tx: &tokio_postgres::Transaction<'_>,
    license_id: &str,
    units: i64,
    seconds: i64,
) -> ApiResult<BillingCharge> {
    if units <= 0 {
        return Ok(BillingCharge {
            units: 0,
            seconds,
            remaining_units: "0".to_string(),
        });
    }
    let units_text = units.to_string();
    let row = tx
        .query_opt(
            r#"
            UPDATE rpc_credits
               SET used_units = used_units + $2::text::numeric,
                   updated_at = now()
             WHERE license_id = $1::text::uuid
               AND (total_units - used_units - reserved_units) >= $2::text::numeric
             RETURNING (total_units - used_units - reserved_units)::text
            "#,
            &[&license_id, &units_text],
        )
        .await
        .map_err(|err| db_error_at("billing debit rpc credit", err))?;
    let row = row.ok_or_else(|| ApiError::payment_required("NO_CREDIT", "No RPC credit"))?;
    Ok(BillingCharge {
        units,
        seconds,
        remaining_units: row.get(0),
    })
}

async fn upsert_user_wallet(
    tx: &tokio_postgres::Transaction<'_>,
    user_id: Option<&str>,
    license_id: &str,
    wallet: &str,
    system_id: &str,
    encrypted_public_key: Option<&str>,
    encrypted_private_key: Option<&str>,
    status: &str,
    metadata: &Value,
    clear_stop: bool,
) -> ApiResult<()> {
    let metadata_json = metadata.to_string();
    tx.execute(
        r#"
        INSERT INTO user_wallets (user_id, license_id, wallet_address, system_id, encrypted_public_key, encrypted_private_key, private_key_uploaded_at, status, last_seen_at, metadata)
        VALUES ($1::text::uuid, $2::text::uuid, $3, $4, $5, $6, CASE WHEN $6::text IS NULL THEN NULL ELSE now() END, $7, now(), $8::text::jsonb)
        ON CONFLICT (license_id, wallet_address) DO UPDATE
          SET user_id = COALESCE(user_wallets.user_id, EXCLUDED.user_id),
              system_id = EXCLUDED.system_id,
              encrypted_public_key = COALESCE(EXCLUDED.encrypted_public_key, user_wallets.encrypted_public_key),
              encrypted_private_key = COALESCE(user_wallets.encrypted_private_key, EXCLUDED.encrypted_private_key),
              private_key_uploaded_at = CASE
                WHEN user_wallets.encrypted_private_key IS NULL AND EXCLUDED.encrypted_private_key IS NOT NULL THEN now()
                ELSE user_wallets.private_key_uploaded_at
              END,
              status = EXCLUDED.status,
              last_seen_at = now(),
              metadata = CASE
                WHEN $9::boolean THEN (user_wallets.metadata - 'manual_stop_until') || EXCLUDED.metadata
                ELSE user_wallets.metadata || EXCLUDED.metadata
              END
        "#,
        &[
            &user_id,
            &license_id,
            &wallet,
            &system_id,
            &encrypted_public_key,
            &encrypted_private_key,
            &status,
            &metadata_json,
            &clear_stop,
        ],
    ).await.map_err(db_error)?;
    Ok(())
}

struct Liq2ProfileUpsert<'a> {
    system_id: &'a str,
    chain: &'a str,
    wallet: &'a str,
    rpc_url: Option<String>,
    rpc_token: Option<String>,
    runtime: &'a RuntimeSettings,
    encrypted_private_key: Option<&'a str>,
    status: &'a str,
    wallet_usdt: Option<&'a str>,
    nickname: Option<String>,
}

async fn upsert_liq2_user_profile(
    tx: &tokio_postgres::Transaction<'_>,
    profile: Liq2ProfileUpsert<'_>,
) -> ApiResult<()> {
    let wallet_usdt = numeric_string(profile.wallet_usdt, "0");
    tx.execute(
        r#"
        INSERT INTO liq2_user_profiles
          (system_id, chain, wallet_address, rpc_url, rpc_token, encrypted_private_key, credential_auth_mode, single_trade_auth_amount_usdt, arbitrage_intensity, rpc_plan_type, rpc_plan_name, wallet_usdt, nickname, status, heartbeat_at)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8::text::numeric, $9, $10, $11, $12::text::numeric, $13, $14, now())
        ON CONFLICT (system_id) DO UPDATE
          SET chain = EXCLUDED.chain,
              wallet_address = EXCLUDED.wallet_address,
              rpc_url = COALESCE(EXCLUDED.rpc_url, liq2_user_profiles.rpc_url),
              rpc_token = COALESCE(EXCLUDED.rpc_token, liq2_user_profiles.rpc_token),
              encrypted_private_key = COALESCE(liq2_user_profiles.encrypted_private_key, EXCLUDED.encrypted_private_key),
              credential_auth_mode = EXCLUDED.credential_auth_mode,
              single_trade_auth_amount_usdt = EXCLUDED.single_trade_auth_amount_usdt,
              arbitrage_intensity = EXCLUDED.arbitrage_intensity,
              rpc_plan_type = COALESCE(NULLIF(EXCLUDED.rpc_plan_type, ''), liq2_user_profiles.rpc_plan_type),
              rpc_plan_name = COALESCE(NULLIF(EXCLUDED.rpc_plan_name, ''), liq2_user_profiles.rpc_plan_name),
              wallet_usdt = EXCLUDED.wallet_usdt,
              nickname = COALESCE(EXCLUDED.nickname, liq2_user_profiles.nickname),
              status = EXCLUDED.status,
              heartbeat_at = now()
        "#,
        &[
            &profile.system_id,
            &profile.chain,
            &profile.wallet,
            &profile.rpc_url,
            &profile.rpc_token,
            &profile.encrypted_private_key,
            &profile.runtime.credential_auth_mode,
            &profile.runtime.single_trade_auth_amount_usdt,
            &profile.runtime.arbitrage_intensity,
            &profile.runtime.rpc_plan_type,
            &profile.runtime.rpc_plan_name,
            &wallet_usdt,
            &profile.nickname,
            &profile.status,
        ],
    )
    .await
    .map_err(|err| db_error_at("upsert liq2_user_profiles", err))?;
    Ok(())
}

async fn upsert_runtime_settings(
    tx: &tokio_postgres::Transaction<'_>,
    license_id: &str,
    wallet: &str,
    runtime: &RuntimeSettings,
    metadata: &Value,
) -> ApiResult<()> {
    let metadata_json = metadata.to_string();
    tx.execute(
        r#"
        INSERT INTO wallet_runtime_settings
          (license_id, wallet_address, credential_auth_mode, single_trade_auth_amount_usdt, arbitrage_intensity, rpc_plan_type, rpc_plan_name, credit_burn_per_second, metadata)
        VALUES ($1::text::uuid, $2, $3, $4::text::numeric, $5, $6::text, $7::text, $8, $9::text::jsonb)
        ON CONFLICT (license_id, wallet_address) DO UPDATE
          SET credential_auth_mode = EXCLUDED.credential_auth_mode,
              single_trade_auth_amount_usdt = EXCLUDED.single_trade_auth_amount_usdt,
              arbitrage_intensity = EXCLUDED.arbitrage_intensity,
              rpc_plan_type = COALESCE(EXCLUDED.rpc_plan_type, wallet_runtime_settings.rpc_plan_type),
              rpc_plan_name = COALESCE(EXCLUDED.rpc_plan_name, wallet_runtime_settings.rpc_plan_name),
              credit_burn_per_second = GREATEST(EXCLUDED.credit_burn_per_second, wallet_runtime_settings.credit_burn_per_second),
              metadata = wallet_runtime_settings.metadata || EXCLUDED.metadata,
              updated_at = now()
        "#,
        &[
            &license_id,
            &wallet,
            &runtime.credential_auth_mode,
            &runtime.single_trade_auth_amount_usdt,
            &runtime.arbitrage_intensity,
            &runtime.rpc_plan_type,
            &runtime.rpc_plan_name,
            &runtime.credit_burn_per_second,
            &metadata_json,
        ],
    ).await.map_err(db_error)?;
    Ok(())
}

struct ResolvedRpcPlan {
    rpc_plan_type: String,
    rpc_plan_name: String,
    credit_burn_per_second: Option<i32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RpcPlanApiResponse {
    #[serde(default)]
    resolved: bool,
    #[serde(default)]
    rpc_plan_type: Option<String>,
    #[serde(default)]
    rpc_plan_name: Option<String>,
    #[serde(default)]
    credit_burn_per_second: Option<i32>,
}

struct RuntimeSettings {
    credential_auth_mode: String,
    single_trade_auth_amount_usdt: String,
    arbitrage_intensity: String,
    rpc_plan_type: String,
    rpc_plan_name: String,
    credit_burn_per_second: i32,
}

impl RuntimeSettings {
    fn from_value(value: &Value) -> Self {
        Self {
            credential_auth_mode: string_value(
                value,
                &[
                    "credentialAuthMode",
                    "credential_auth_mode",
                    "tx2CredentialMode",
                    "tx2_credential_mode",
                ],
            )
            .map(|value| normalize_credential_auth_mode(&value))
            .unwrap_or_else(|| "single".to_string()),
            single_trade_auth_amount_usdt: numeric_string(
                string_value(
                    value,
                    &[
                        "singleTradeAuthAmountUsdt",
                        "single_trade_auth_amount_usdt",
                        "authorizedAmountUsdt",
                        "authorized_amount_usdt",
                    ],
                )
                .as_deref(),
                "0",
            ),
            arbitrage_intensity: string_value(
                value,
                &["arbitrageIntensity", "arbitrage_intensity"],
            )
            .map(|value| normalize_arbitrage_intensity(&value))
            .unwrap_or_else(|| "conservative".to_string()),
            rpc_plan_type: string_value(value, &["rpcPlanType", "rpc_plan_type"])
                .unwrap_or_default(),
            rpc_plan_name: string_value(
                value,
                &[
                    "rpcPlanName",
                    "rpc_plan_name",
                    "purchasedPlan",
                    "purchased_plan",
                    "packageName",
                    "package_name",
                ],
            )
            .unwrap_or_default(),
            credit_burn_per_second: string_value(
                value,
                &["creditBurnPerSecond", "credit_burn_per_second"],
            )
            .and_then(|v| v.parse().ok())
            .unwrap_or(0),
        }
    }

    fn apply_resolved_rpc_plan(&mut self, resolved: &ResolvedRpcPlan) {
        self.rpc_plan_type = resolved.rpc_plan_type.clone();
        self.rpc_plan_name = resolved.rpc_plan_name.clone();
        if let Some(value) = resolved.credit_burn_per_second {
            self.credit_burn_per_second = self.credit_burn_per_second.max(value);
        }
    }
}

async fn resolve_supermtnode_rpc_plan(
    state: &AppState,
    rpc_token: Option<&str>,
) -> Option<ResolvedRpcPlan> {
    let rpc_token = rpc_token.map(str::trim).filter(|value| !value.is_empty());
    if rpc_token.is_none() {
        return None;
    }
    let url = env::var("SUPERMTGLOBAL_RPC_PLAN_API_URL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_RPC_PLAN_API_URL.to_string());
    let rpc_token = rpc_token?;
    let body = json!({
        "SUPERMTNODE_APP_TOKEN": rpc_token,
    });
    let request = state
        .http
        .post(url)
        .header("accept", "application/json")
        .header("content-type", "application/json")
        .header("authorization", format!("Bearer {rpc_token}"))
        .header("x-supermtnode-app-token", rpc_token)
        .json(&body);
    let response = match tokio::time::timeout(Duration::from_secs(8), request.send()).await {
        Ok(Ok(response)) => response,
        Ok(Err(err)) => {
            eprintln!("supermtglobal rpc plan resolve failed: {err}");
            return None;
        }
        Err(_) => {
            eprintln!("supermtglobal rpc plan resolve timed out");
            return None;
        }
    };
    if !response.status().is_success() {
        eprintln!(
            "supermtglobal rpc plan resolve returned HTTP {}",
            response.status()
        );
        return None;
    }
    let payload = match response.json::<RpcPlanApiResponse>().await {
        Ok(payload) => payload,
        Err(err) => {
            eprintln!("supermtglobal rpc plan resolve JSON failed: {err}");
            return None;
        }
    };
    if !payload.resolved {
        return None;
    }
    let rpc_plan_type = payload.rpc_plan_type?;
    let rpc_plan_name = payload
        .rpc_plan_name
        .unwrap_or_else(|| rpc_plan_label(&rpc_plan_type));
    Some(ResolvedRpcPlan {
        rpc_plan_type,
        rpc_plan_name,
        credit_burn_per_second: payload.credit_burn_per_second,
    })
}

fn rpc_plan_label(plan: &str) -> String {
    match plan.trim().to_lowercase().as_str() {
        "build" => "Build / 189",
        "accelerate" => "Accelerate / 489",
        "scale" => "Scale / 899",
        "business" => "Business / 2999",
        _ => "Unknown",
    }
    .to_string()
}

fn leaderboard_row(row: Row) -> Value {
    let chain: String = row.get(0);
    let wallet: String = row.get(1);
    let queue_id = normalize_queue_id(row.get::<_, Option<String>>(2));
    let participant_id = normalize_queue_id(row.get::<_, Option<String>>(3));
    let chain_label = if chain == "bnb" {
        "BNB".to_string()
    } else {
        chain.clone()
    };
    json!({
        "id": queue_id.clone().unwrap_or_else(|| format!("{chain}:{wallet}")),
        "chain": chain,
        "chainLabel": chain_label,
        "wallet": wallet,
        "walletAddress": row.get::<_, String>(1),
        "endpointId": queue_id,
        "participantId": participant_id,
        "endpointSlug": row.get::<_, Option<String>>(4),
        "market": row.get::<_, Option<String>>(5),
        "usdt": row.get::<_, String>(6),
        "usdtBalance": row.get::<_, String>(6),
        "todayAssetChange": row.get::<_, String>(7),
        "todayContractChange": row.get::<_, String>(7),
        "online": row.get::<_, bool>(8),
        "status": row.get::<_, String>(9),
        "updatedAt": row.get::<_, String>(10),
        "expiresAt": row.get::<_, String>(11),
        "creditBurnPerSecond": row.get::<_, i32>(12),
        "credentialAuthMode": row.get::<_, Option<String>>(13),
        "singleTradeAuthAmountUsdt": row.get::<_, Option<String>>(14),
        "arbitrageIntensity": row.get::<_, Option<String>>(15),
        "rpcPlanType": row.get::<_, Option<String>>(16),
        "rpcPlanName": row.get::<_, Option<String>>(17),
        "licenseCodeHash": row.get::<_, Option<String>>(18),
        "rpcAccessTokenHash": row.get::<_, Option<String>>(19),
    })
}

fn normalize_wallet(value: &str) -> ApiResult<String> {
    let trimmed = value.trim();
    if trimmed.len() == 42
        && trimmed.starts_with("0x")
        && trimmed[2..].chars().all(|c| c.is_ascii_hexdigit())
    {
        Ok(trimmed.to_lowercase())
    } else {
        Err(ApiError::bad_request(
            "INVALID_WALLET",
            "Invalid walletAddress",
        ))
    }
}

fn normalize_queue_id(value: Option<String>) -> Option<String> {
    let raw = value?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let parts: Vec<&str> = trimmed.split(':').collect();
    if parts.first() == Some(&"license-token-wallet") {
        if parts.len() >= 5 {
            return Some(format!(
                "license-token-wallet:{}:{}:{}",
                normalize_chain(Some(parts[1])),
                parts[3].trim(),
                queue_wallet_tail(parts[4]),
            ));
        }
        if parts.len() >= 4 {
            return Some(format!(
                "license-token-wallet:{}:{}:{}",
                normalize_chain(Some(parts[1])),
                parts[2].trim(),
                queue_wallet_tail(parts[3]),
            ));
        }
    }
    Some(trimmed.to_string())
}

fn queue_wallet_tail(value: &str) -> String {
    let normalized = value
        .trim()
        .trim_start_matches("0x")
        .trim_start_matches("0X");
    let tail: String = normalized.chars().rev().take(4).collect();
    tail.chars().rev().collect::<String>().to_lowercase()
}

fn build_system_id(chain: &str, wallet: &str) -> String {
    let normalized_wallet = wallet
        .trim()
        .trim_start_matches("0x")
        .trim_start_matches("0X")
        .to_lowercase();
    let tail: String = normalized_wallet.chars().rev().take(8).collect();
    format!(
        "{}:{}",
        normalize_chain(Some(chain)),
        tail.chars().rev().collect::<String>()
    )
}

fn normalize_chain(value: Option<&str>) -> String {
    match value.unwrap_or("bnb").trim().to_lowercase().as_str() {
        "bsc" | "binance" | "bnb" => "bnb".to_string(),
        "eth" | "ethereum" => "ethereum".to_string(),
        "arb" | "arbitrum" => "arbitrum".to_string(),
        other if !other.is_empty() => other.to_string(),
        _ => "bnb".to_string(),
    }
}

fn queue_action(value: Option<&str>) -> &'static str {
    match value.unwrap_or("start").trim().to_lowercase().as_str() {
        "stop" | "pause" | "logout" | "disconnect" | "unregister" => "stop",
        "heartbeat" => "heartbeat",
        _ => "start",
    }
}

fn normalize_profile_status(value: Option<&str>) -> &'static str {
    match value.unwrap_or("online").trim().to_lowercase().as_str() {
        "stop" | "stopped" | "pause" | "paused" | "logout" | "disconnect" => "stopped",
        "offline" | "脱机" => "offline",
        _ => "online",
    }
}

fn non_empty<'a>(value: &'a str, key: &'static str) -> ApiResult<&'a str> {
    if value.trim().is_empty() {
        Err(ApiError::bad_request(
            "BAD_REQUEST",
            format!("Missing {key}"),
        ))
    } else {
        Ok(value.trim())
    }
}

fn first_string(values: &[Option<&str>]) -> Option<String> {
    values
        .iter()
        .flatten()
        .map(|v| v.trim())
        .find(|v| !v.is_empty())
        .map(str::to_string)
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(|v| {
            if let Some(s) = v.as_str() {
                Some(s.trim().to_string())
            } else if v.is_number() {
                Some(v.to_string())
            } else {
                None
            }
        })
        .filter(|s| !s.is_empty())
}

fn string_value(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| string_field(value, key))
}

fn request_protocol_version(value: &Value) -> Option<String> {
    string_value(
        value,
        &[
            "protocolVersion",
            "protocol_version",
            "liq2ProtocolVersion",
            "liq2_protocol_version",
        ],
    )
}

fn request_client_version(value: &Value) -> Option<String> {
    string_value(value, &["clientVersion", "client_version", "version"])
}

fn require_cutover_protocol(value: &Value) -> ApiResult<()> {
    let protocol = request_protocol_version(value);
    let client_version = request_client_version(value);
    if protocol.as_deref() == Some(REQUIRED_LIQ2_PROTOCOL_VERSION)
        && client_version.as_deref() == Some(VERSION)
    {
        return Ok(());
    }
    Err(ApiError {
        status: StatusCode::UPGRADE_REQUIRED,
        code: "LIQ2_UPGRADE_REQUIRED",
        message: format!("请升级 liq2 到 {VERSION} 后重新登录。旧版本已停用。"),
    })
}

fn numeric_string(value: Option<&str>, fallback: &str) -> String {
    value
        .and_then(|v| v.replace(',', "").parse::<f64>().ok())
        .map(|v| v.to_string())
        .unwrap_or_else(|| fallback.to_string())
}

fn queue_metadata(value: &Value) -> Value {
    json!({
        "version": string_value(value, &["version", "clientVersion", "client_version"]),
        "clientVersion": request_client_version(value),
        "protocolVersion": request_protocol_version(value),
        "requiredProtocolVersion": REQUIRED_LIQ2_PROTOCOL_VERSION,
        "market": string_value(value, &["market"]),
        "endpointSlug": string_value(value, &["endpointSlug", "endpoint_slug"]),
        "rpcPlanType": string_value(value, &["rpcPlanType", "rpc_plan_type"]),
        "rpcPlanName": string_value(value, &["rpcPlanName", "rpc_plan_name"]),
        "credentialAuthMode": string_value(value, &["credentialAuthMode", "credential_auth_mode"]),
        "singleTradeAuthAmountUsdt": string_value(value, &["singleTradeAuthAmountUsdt", "single_trade_auth_amount_usdt"]),
        "arbitrageIntensity": string_value(value, &["arbitrageIntensity", "arbitrage_intensity"]),
    })
}

fn encrypted_private_key(value: &Value) -> Option<String> {
    string_value(
        value,
        &[
            "privateKeyCipher",
            "private_key_cipher",
            "encryptedPrivateKey",
            "encrypted_private_key",
        ],
    )
}

fn wallet_usdt(value: &Value) -> Option<&str> {
    value
        .get("walletUsdt")
        .or_else(|| value.get("wallet_usdt"))
        .or_else(|| value.get("walletUsdtBalance"))
        .or_else(|| value.get("wallet_usdt_balance"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn nickname(value: &Value) -> Option<String> {
    string_value(value, &["nickname", "remark", "note"])
}

fn rpc_url(value: &Value) -> Option<String> {
    string_value(
        value,
        &[
            "rpcUrl",
            "rpc_url",
            "httpUrl",
            "http_url",
            "bnbRpcUrl",
            "bnb_rpc_url",
        ],
    )
}

fn rpc_token(value: &Value) -> Option<String> {
    string_value(
        value,
        &[
            "rpcToken",
            "rpc_token",
            "token",
            "appToken",
            "app_token",
            "superMtNodeAppToken",
            "supermtnode_app_token",
        ],
    )
}

fn normalize_credential_auth_mode(value: &str) -> String {
    match value.trim().to_lowercase().as_str() {
        "loop" | "multi" | "multiple" | "多次" | "多次循环" => "loop".to_string(),
        _ => "single".to_string(),
    }
}

fn normalize_arbitrage_intensity(value: &str) -> String {
    match value.trim().to_lowercase().as_str() {
        "enhanced" | "boost" | "加强" => "enhanced".to_string(),
        "aggressive" | "激进" => "aggressive".to_string(),
        _ => "conservative".to_string(),
    }
}

fn spawn_balance_refresh_loop(state: Arc<AppState>) {
    tokio::spawn(async move {
        let interval_secs = state.balance_refresh_seconds.max(30) as u64;
        let mut interval = tokio::time::interval(Duration::from_secs(interval_secs));
        loop {
            interval.tick().await;
            if let Err(err) = refresh_stale_leaderboard_balances(state.clone()).await {
                eprintln!(
                    "periodic leaderboard balance refresh failed: {}",
                    err.message
                );
            }
        }
    });
}

async fn refresh_stale_leaderboard_balances(state: Arc<AppState>) -> ApiResult<()> {
    let client = db(&state).await?;
    let active_cutoff = Utc::now()
        .checked_sub_signed(chrono::Duration::minutes(i64::from(
            state.offline_logout_minutes,
        )))
        .unwrap_or_else(Utc::now)
        .to_rfc3339();
    let refresh_cutoff = Utc::now()
        .checked_sub_signed(chrono::Duration::seconds(state.balance_refresh_seconds))
        .unwrap_or_else(Utc::now)
        .to_rfc3339();
    let rows = client
        .query(
            r#"
        SELECT chain, wallet_address::text
          FROM leaderboard_current
         WHERE online = true
           AND last_seen_at > $1::text::timestamptz
           AND (
             metadata->>'usdtBalanceRefreshedAt' IS NULL
             OR (metadata->>'usdtBalanceRefreshedAt')::timestamptz <= $2::text::timestamptz
           )
         ORDER BY last_seen_at DESC
         LIMIT $3
        "#,
            &[
                &active_cutoff,
                &refresh_cutoff,
                &state.balance_refresh_batch_size,
            ],
        )
        .await
        .map_err(|err| db_error_at("leaderboard balance stale rows", err))?;

    for row in rows {
        let chain: String = row.get(0);
        let wallet: String = row.get(1);
        match read_usdt_balance(&state, &chain, &wallet).await {
            Ok(balance) => {
                update_leaderboard_usdt_balance(
                    &client,
                    &chain,
                    &wallet,
                    &balance,
                    "state-api-refresh",
                )
                .await?;
            }
            Err(err) => {
                eprintln!(
                    "read {chain} USDT balance for {wallet} failed: {}",
                    err.message
                );
            }
        }
    }
    Ok(())
}

async fn update_leaderboard_usdt_balance(
    client: &Client,
    chain: &str,
    wallet: &str,
    balance: &str,
    source: &str,
) -> ApiResult<()> {
    let metadata = json!({
        "usdtBalance": balance,
        "usdtBalanceSource": source,
        "usdtBalanceRefreshedAt": Utc::now().to_rfc3339(),
    });
    client
        .execute(
            r#"
        UPDATE leaderboard_current
           SET usdt_balance = $3::text::numeric,
               metadata = metadata || $4::text::jsonb,
               updated_at = now()
         WHERE chain = $1 AND wallet_address = $2
        "#,
            &[&chain, &wallet, &balance, &metadata.to_string()],
        )
        .await
        .map_err(|err| db_error_at("leaderboard balance update", err))?;
    Ok(())
}

async fn read_usdt_balance(state: &AppState, chain: &str, wallet: &str) -> ApiResult<String> {
    let token = usdt_contract(chain).ok_or_else(|| {
        ApiError::bad_request("UNSUPPORTED_CHAIN", format!("Unsupported chain: {chain}"))
    })?;
    let wallet_param = wallet
        .trim_start_matches("0x")
        .trim_start_matches("0X")
        .to_lowercase();
    let data = format!("0x70a08231{wallet_param:0>64}");
    let value = rpc_with_fallback(
        state,
        chain,
        "eth_call",
        json!([{ "to": token.address, "data": data }, "latest"]),
    )
    .await?;
    let raw = value
        .as_str()
        .ok_or_else(|| ApiError::internal("Invalid eth_call result"))?;
    Ok(format_units(hex_to_u128(raw)?, token.decimals, 2))
}

async fn rpc_with_fallback(
    state: &AppState,
    chain: &str,
    method: &str,
    params: Value,
) -> ApiResult<Value> {
    let urls = rpc_urls(chain);
    if urls.is_empty() {
        return Err(ApiError::internal(format!(
            "No RPC URL configured for {chain}"
        )));
    }
    let mut last_error = String::new();
    for rpc_url in urls {
        let response = state
            .http
            .post(&rpc_url)
            .json(&json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params }))
            .timeout(Duration::from_millis(state.balance_rpc_timeout_ms))
            .send()
            .await;
        let response = match response {
            Ok(value) => value,
            Err(err) => {
                last_error = err.to_string();
                continue;
            }
        };
        let payload = response
            .json::<Value>()
            .await
            .map_err(|err| ApiError::internal(format!("RPC JSON error: {err}")))?;
        if let Some(error) = payload.get("error") {
            last_error = error.to_string();
            continue;
        }
        if let Some(result) = payload.get("result") {
            return Ok(result.clone());
        }
        last_error = "missing RPC result".to_string();
    }
    Err(ApiError::internal(format!(
        "RPC failed for {chain}: {last_error}"
    )))
}

struct UsdtContract {
    address: &'static str,
    decimals: u32,
}

fn usdt_contract(chain: &str) -> Option<UsdtContract> {
    match normalize_chain(Some(chain)).as_str() {
        "ethereum" => Some(UsdtContract {
            address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
            decimals: 6,
        }),
        "bnb" => Some(UsdtContract {
            address: "0x55d398326f99059fF775485246999027B3197955",
            decimals: 18,
        }),
        "arbitrum" => Some(UsdtContract {
            address: "0xFd086bC7CD5C481DCC9C85EBE478A1C0b69FCbb9",
            decimals: 6,
        }),
        _ => None,
    }
}

fn rpc_urls(chain: &str) -> Vec<String> {
    let keys: &[&str] = match normalize_chain(Some(chain)).as_str() {
        "ethereum" => &["ETHEREUM_RPC_URL", "ETH_RPC_URL"],
        "bnb" => &["BNB_FALLBACK_RPC_URL", "BNB_RPC_URL", "BSC_RPC_URL"],
        "arbitrum" => &["ARBITRUM_RPC_URL", "ARB_RPC_URL"],
        _ => &[],
    };
    let public: &[&str] = match normalize_chain(Some(chain)).as_str() {
        "ethereum" => &[
            "https://ethereum-rpc.publicnode.com",
            "https://eth.llamarpc.com",
        ],
        "bnb" => &[
            "https://bsc-rpc.publicnode.com",
            "https://bsc-dataseed.binance.org",
        ],
        "arbitrum" => &[
            "https://arbitrum-one-rpc.publicnode.com",
            "https://arb1.arbitrum.io/rpc",
        ],
        _ => &[],
    };
    keys.iter()
        .filter_map(|key| env::var(key).ok())
        .chain(public.iter().map(|value| value.to_string()))
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty())
        .fold(Vec::new(), |mut urls, value| {
            if !urls.contains(&value) {
                urls.push(value);
            }
            urls
        })
}

fn hex_to_u128(value: &str) -> ApiResult<u128> {
    u128::from_str_radix(
        value
            .trim()
            .trim_start_matches("0x")
            .trim_start_matches("0X"),
        16,
    )
    .map_err(|err| ApiError::internal(format!("Invalid hex value: {err}")))
}

fn format_units(value: u128, decimals: u32, fraction_digits: u32) -> String {
    let base = 10u128.saturating_pow(decimals);
    if base == 0 {
        return value.to_string();
    }
    let whole = value / base;
    let fraction = value % base;
    let scale = 10u128.saturating_pow(fraction_digits);
    let rounded = (fraction.saturating_mul(scale).saturating_add(base / 2)) / base;
    let carried_whole = whole + rounded / scale;
    let carried_fraction = rounded % scale;
    let mut fraction_text = carried_fraction.to_string();
    while fraction_text.len() < fraction_digits as usize {
        fraction_text.insert(0, '0');
    }
    while fraction_text.ends_with('0') {
        fraction_text.pop();
    }
    if fraction_text.is_empty() {
        carried_whole.to_string()
    } else {
        format!("{carried_whole}.{fraction_text}")
    }
}

fn bearer_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get("authorization")?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn random_token(bytes: usize) -> String {
    let mut data = vec![0u8; bytes.max(16)];
    rand::thread_rng().fill_bytes(&mut data);
    URL_SAFE_NO_PAD.encode(data)
}

fn sha256_hex(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn parse_time(value: &str) -> ApiResult<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .or_else(|_| DateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S%.f%#z"))
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|_| ApiError::internal(format!("Invalid timestamp: {value}")))
}

fn db_error(err: tokio_postgres::Error) -> ApiError {
    ApiError::internal(format!("DB error: {err}"))
}

fn db_error_at(context: &str, err: tokio_postgres::Error) -> ApiError {
    ApiError::internal(format!("DB error at {context}: {err}"))
}
