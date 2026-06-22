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
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{env, net::SocketAddr, sync::Arc};
use tokio_postgres::{Client, NoTls, Row};
use tower_http::cors::CorsLayer;

const VERSION: &str = "1.5.4";

#[derive(Clone)]
struct AppState {
    database_url: String,
    lease_seconds: i32,
    access_token_bytes: usize,
    offline_logout_minutes: i32,
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
        Self { status: StatusCode::BAD_REQUEST, code, message: message.into() }
    }

    fn unauthorized(code: &'static str, message: impl Into<String>) -> Self {
        Self { status: StatusCode::UNAUTHORIZED, code, message: message.into() }
    }

    fn payment_required(code: &'static str, message: impl Into<String>) -> Self {
        Self { status: StatusCode::PAYMENT_REQUIRED, code, message: message.into() }
    }

    fn internal(message: impl Into<String>) -> Self {
        Self { status: StatusCode::INTERNAL_SERVER_ERROR, code: "INTERNAL", message: message.into() }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(json!({ "ok": false, "code": self.code, "message": self.message }))).into_response()
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
    #[serde(default)]
    balances: Option<Value>,
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

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::from_path("/opt/supermt-state/.env").ok();
    let state = Arc::new(AppState {
        database_url: env::var("STATE_DATABASE_URL")?,
        lease_seconds: env::var("SESSION_LEASE_SECONDS").ok().and_then(|v| v.parse().ok()).unwrap_or(90),
        access_token_bytes: env::var("ACCESS_TOKEN_BYTES").ok().and_then(|v| v.parse().ok()).unwrap_or(32),
        offline_logout_minutes: env::var("OFFLINE_LOGOUT_MINUTES").ok().and_then(|v| v.parse().ok()).unwrap_or(5),
    });

    let port: u16 = env::var("STATE_API_PORT").ok().and_then(|v| v.parse().ok()).unwrap_or(8790);
    let app = Router::new()
        .route("/health", get(health))
        .route("/v1/health", get(health))
        .route("/v1/auth/login", post(login))
        .route("/v1/auth/heartbeat", post(auth_heartbeat))
        .route("/v1/auth/logout", post(auth_logout))
        .route("/v1/queue/status", post(queue_status))
        .route("/v1/leaderboard", get(leaderboard))
        .route("/v1/rpc", post(rpc_not_available))
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
    client.query_one("SELECT 1", &[]).await.map_err(|err| ApiError::internal(format!("DB health failed: {err}")))?;
    Ok(Json(json!({ "ok": true, "version": VERSION, "db": true, "service": "supermt-state-api-rust" })))
}

async fn login(State(state): State<Arc<AppState>>, headers: HeaderMap, Json(body): Json<LoginRequest>) -> ApiResult<Json<LoginResponse>> {
    let wallet = normalize_wallet(&body.wallet_address)?;
    let token_value = first_string(&[Some(body.token.as_str()), body.app_token.as_deref(), body.auth_identity.as_deref()]).unwrap_or_default();
    let token = non_empty(&token_value, "token")?;
    let token_hash = sha256_hex(token);
    let submitted_auth_code = first_string(&[body.auth_code.as_deref()])
        .or_else(|| string_field(&body.extra, "authCode"))
        .or_else(|| string_field(&body.extra, "auth_code"));
    let auth_code_hash = submitted_auth_code.as_deref().map(sha256_hex);
    let access_token = random_token(state.access_token_bytes);
    let access_hash = sha256_hex(&access_token);
    let device_id = if body.device_id.trim().is_empty() { "default-device".to_string() } else { body.device_id.trim().chars().take(160).collect() };
    let encrypted_public_key = first_string(&[
        body.encrypted_public_key.as_deref(),
        body.wallet_public_key.as_deref(),
        body.public_key.as_deref(),
        body.private_key_encrypted_public_key.as_deref(),
    ]);
    let runtime = RuntimeSettings::from_value(&body.extra);
    let metadata = queue_metadata(&body.extra);
    let user_agent = headers.get("user-agent").and_then(|v| v.to_str().ok()).map(str::to_string);
    let lease_seconds = f64::from(state.lease_seconds);
    let mut client = db(&state).await?;
    let tx = client.transaction().await.map_err(|err| db_error_at("login begin", err))?;

    let license_row = tx.query_opt(
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
    ).await.map_err(|err| db_error_at("login read license", err))?;
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
        return Err(ApiError::payment_required("TOKEN_NOT_ACTIVE", "Token is not active"));
    }
    if parse_time(&license_starts_at)? > Utc::now() {
        return Err(ApiError::payment_required("TOKEN_NOT_STARTED", "Token is not active yet"));
    }
    if parse_time(&license_expires_at)? <= Utc::now() {
        return Err(ApiError::payment_required("TOKEN_EXPIRED", "Token expired"));
    }
    if remaining_units.parse::<i128>().unwrap_or(0) <= 0 {
        return Err(ApiError::payment_required("NO_CREDIT", "No RPC credit"));
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

    tx.execute("UPDATE licenses SET user_id = COALESCE(user_id, $1::text::uuid) WHERE id = $2::text::uuid", &[&user_id, &license_id]).await.map_err(|err| db_error_at("login bind user license", err))?;
    upsert_user_wallet(&tx, Some(&user_id), &license_id, &wallet, encrypted_public_key.as_deref(), "online", &metadata, true).await?;
    upsert_runtime_settings(&tx, &license_id, &wallet, &runtime, &metadata).await?;

    let session_row = tx.query_one(
        r#"
        INSERT INTO sessions (license_id, wallet_address, device_id, access_token_hash, status, user_agent, lease_expires_at)
        VALUES ($1::text::uuid, $2, $3, $4, 'online', $5, now() + make_interval(secs => $6))
        ON CONFLICT (license_id, device_id) DO UPDATE
          SET wallet_address = EXCLUDED.wallet_address,
              access_token_hash = EXCLUDED.access_token_hash,
              status = 'online',
              user_agent = EXCLUDED.user_agent,
              connected_at = now(),
              last_heartbeat_at = now(),
              lease_expires_at = now() + make_interval(secs => $6),
              disconnected_at = NULL
        RETURNING id::text, lease_expires_at::text
        "#,
        &[&license_id, &wallet, &device_id, &access_hash, &user_agent, &lease_seconds],
    ).await.map_err(|err| db_error_at("login upsert session", err))?;
    let session_id: String = session_row.get(0);
    let lease_expires_at: String = session_row.get(1);

    tx.commit().await.map_err(|err| db_error_at("login commit", err))?;
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

async fn provision_client_license(tx: &tokio_postgres::Transaction<'_>, token_hash: &str, auth_code_hash: Option<&str>) -> ApiResult<LicenseInfo> {
    let auth_hash = auth_code_hash.filter(|v| !v.trim().is_empty()).unwrap_or(token_hash);
    let row = tx.query_one(
        r#"
        INSERT INTO licenses (auth_code_hash, token_hash, expires_at)
        VALUES ($1, $2, now() + interval '10 years')
        ON CONFLICT (token_hash) DO UPDATE
          SET updated_at = now()
        RETURNING id::text, expires_at::text, status::text, starts_at::text
        "#,
        &[&auth_hash, &token_hash],
    ).await.map_err(|err| db_error_at("login provision license", err))?;
    let license_id: String = row.get(0);
    tx.execute(
        r#"
        INSERT INTO rpc_credits (license_id, total_units, used_units, reserved_units)
        VALUES ($1::text::uuid, 1000000000000, 0, 0)
        ON CONFLICT (license_id) DO NOTHING
        "#,
        &[&license_id],
    ).await.map_err(|err| db_error_at("login provision credits", err))?;
    Ok(LicenseInfo {
        id: license_id,
        expires_at: row.get(1),
        status: row.get(2),
        starts_at: row.get(3),
        remaining_units: "1000000000000".to_string(),
    })
}

async fn auth_heartbeat(State(state): State<Arc<AppState>>, headers: HeaderMap) -> ApiResult<Json<Value>> {
    let token = bearer_token(&headers).ok_or_else(|| ApiError::unauthorized("UNAUTHORIZED", "Missing token"))?;
    let client = db(&state).await?;
    let lease_seconds = f64::from(state.lease_seconds);
    let row = client.query_opt(
        r#"
        UPDATE sessions
           SET status = 'online',
               last_heartbeat_at = now(),
               lease_expires_at = now() + make_interval(secs => $2),
               updated_at = now()
         WHERE access_token_hash = $1
         RETURNING id::text, lease_expires_at::text
        "#,
        &[&sha256_hex(&token), &lease_seconds],
    ).await.map_err(db_error)?;
    let row = row.ok_or_else(|| ApiError::unauthorized("INVALID_SESSION", "Session not found"))?;
    Ok(Json(json!({ "ok": true, "sessionId": row.get::<_, String>(0), "leaseExpiresAt": row.get::<_, String>(1) })))
}

async fn auth_logout(State(state): State<Arc<AppState>>, headers: HeaderMap) -> ApiResult<Json<Value>> {
    let token = bearer_token(&headers).ok_or_else(|| ApiError::unauthorized("UNAUTHORIZED", "Missing token"))?;
    let client = db(&state).await?;
    client.execute(
        "UPDATE sessions SET status = 'logout', disconnected_at = now(), updated_at = now() WHERE access_token_hash = $1",
        &[&sha256_hex(&token)],
    ).await.map_err(db_error)?;
    Ok(Json(json!({ "ok": true })))
}

async fn queue_status(State(state): State<Arc<AppState>>, headers: HeaderMap, Json(body): Json<QueueRequest>) -> ApiResult<Json<Value>> {
    let session = require_session(&state, &headers).await?;
    let action = queue_action(body.action.as_deref());
    let stopping = action == "stop";
    let chain = normalize_chain(body.chain.as_deref());
    let wallet = normalize_wallet(
        body.wallet_address
            .as_deref()
            .or_else(|| body.wallet.as_ref().and_then(|v| v.as_str()))
            .unwrap_or(&session.wallet_address),
    )?;
    let encrypted_public_key = first_string(&[body.encrypted_public_key.as_deref(), body.wallet_public_key.as_deref()]);
    let runtime = RuntimeSettings::from_value(&body.extra);
    if action == "start" && string_field(&body.extra, "startIntentId").or(body.start_intent_id.clone()).unwrap_or_default().is_empty() {
        return Err(ApiError::bad_request("START_INTENT_REQUIRED", "Missing startIntentId"));
    }
    if action == "start" && (runtime.rpc_plan_type.is_empty() || runtime.rpc_plan_name.is_empty() || runtime.credit_burn_per_second <= 0) {
        return Err(ApiError::bad_request("QUEUE_RUNTIME_REQUIRED", "Missing queue runtime fields"));
    }

    let metadata = queue_metadata(&body.extra);
    let metadata_json = metadata.to_string();
    let mut client = db(&state).await?;
    let tx = client.transaction().await.map_err(db_error)?;
    if stopping {
        tx.execute(
            "UPDATE user_wallets SET status = 'stopped', last_seen_at = now(), metadata = metadata || $3::text::jsonb WHERE license_id = $1::text::uuid AND wallet_address = $2",
            &[&session.license_id, &wallet, &metadata_json],
        ).await.map_err(|err| db_error_at("queue stop user_wallets", err))?;
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
        ).await.map_err(|err| db_error_at("queue stop leaderboard", err))?;
        tx.commit().await.map_err(db_error)?;
        return Ok(Json(json!({ "ok": true, "queue": { "chain": chain, "wallet_address": wallet, "online": false, "status": "stopped" } })));
    }

    upsert_user_wallet(&tx, session.user_id.as_deref(), &session.license_id, &wallet, encrypted_public_key.as_deref(), "online", &metadata, action == "start").await?;
    upsert_runtime_settings(&tx, &session.license_id, &wallet, &runtime, &metadata).await?;

    let usdt_balance = usdt_balance(&body.extra, body.balances.as_ref());
    let today_delta = "0";
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
    let endpoint_slug = body.endpoint_slug.clone().or_else(|| string_field(&body.extra, "endpointSlug"));
    let market = body.market.clone().or_else(|| string_field(&body.extra, "market"));
    let expires_at = body.expires_at.clone().or_else(|| string_field(&body.extra, "expiresAt"));
    let expires_at = expires_at.unwrap_or_else(|| chrono::Utc::now().checked_add_signed(chrono::Duration::minutes(30)).unwrap().to_rfc3339());

    let row = tx.query_one(
        r#"
        INSERT INTO leaderboard_current
          (chain, wallet_address, license_id, session_id, queue_id, participant_id, endpoint_slug, market, usdt_balance, today_delta_usdt, online, status, last_seen_at, expires_at, credit_burn_per_second, metadata, last_billed_at)
        VALUES ($1, $2, $3::text::uuid, $4::text::uuid, $5::text, $6::text, $7::text, $8::text, $9::text::numeric, $10::text::numeric, true, 'online', now(), $11::text::timestamptz, $12, $13::text::jsonb, now())
        ON CONFLICT (chain, wallet_address) DO UPDATE
          SET license_id = EXCLUDED.license_id,
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
              metadata = leaderboard_current.metadata || EXCLUDED.metadata,
              updated_at = now()
        RETURNING chain, wallet_address, online, status::text, expires_at::text
        "#,
        &[
            &chain,
            &wallet,
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
            &metadata_json,
        ],
    ).await.map_err(|err| db_error_at("queue upsert leaderboard", err))?;
    tx.commit().await.map_err(|err| db_error_at("queue commit", err))?;
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

async fn leaderboard(State(state): State<Arc<AppState>>, Query(query): Query<LeaderboardQuery>) -> ApiResult<Json<Value>> {
    let chain = normalize_chain(query.chain.as_deref());
    let limit = query.limit.unwrap_or(50).clamp(1, 200);
    let include_offline = query.include_offline.unwrap_or_default().eq_ignore_ascii_case("true");
    let client = db(&state).await?;
    client.execute(
        r#"
        UPDATE leaderboard_current
           SET online = false,
               status = 'offline',
               updated_at = now()
         WHERE online = true
           AND (last_seen_at <= now() - make_interval(mins => $1) OR expires_at <= now())
        "#,
        &[&state.offline_logout_minutes],
    ).await.map_err(|err| db_error_at("leaderboard mark offline", err))?;
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
        LEFT JOIN wallet_runtime_settings wrs ON wrs.license_id = lc.license_id AND wrs.wallet_address = lc.wallet_address
        WHERE lc.chain = $1
          AND ($2::boolean OR (lc.online = true AND lc.last_seen_at > now() - make_interval(mins => $4)))
        ORDER BY lc.usdt_balance DESC, lc.today_delta_usdt DESC, lc.last_seen_at DESC
        LIMIT $3
        "#,
        &[&chain, &include_offline, &limit, &state.offline_logout_minutes],
    ).await.map_err(|err| db_error_at("upsert user_wallets", err))?;
    let wallets: Vec<Value> = rows.into_iter().map(leaderboard_row).collect();
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
    Err(ApiError::bad_request("RPC_NOT_ENABLED", "State RPC is not enabled in Rust state API"))
}

async fn require_session(state: &AppState, headers: &HeaderMap) -> ApiResult<SessionInfo> {
    let token = bearer_token(headers).ok_or_else(|| ApiError::unauthorized("UNAUTHORIZED", "Missing bearer token"))?;
    let client = db(state).await?;
    let row = client.query_opt(
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
          (c.total_units - c.used_units - c.reserved_units)::text
        FROM sessions s
        JOIN licenses l ON l.id = s.license_id
        JOIN rpc_credits c ON c.license_id = l.id
        WHERE s.access_token_hash = $1
        "#,
        &[&sha256_hex(&token)],
    ).await.map_err(|err| db_error_at("upsert runtime_settings", err))?;
    let row = row.ok_or_else(|| ApiError::unauthorized("INVALID_SESSION", "Invalid session"))?;
    let session_status: String = row.get(4);
    let lease_expires_at: String = row.get(5);
    let license_status: String = row.get(6);
    let expires_at: String = row.get(7);
    let remaining_units: String = row.get(8);
    if !matches!(session_status.as_str(), "online" | "recovering") || parse_time(&lease_expires_at)? < Utc::now() {
        return Err(ApiError::unauthorized("SESSION_EXPIRED", "Session expired"));
    }
    if license_status != "active" {
        return Err(ApiError::payment_required("TOKEN_NOT_ACTIVE", "Token is not active"));
    }
    if parse_time(&expires_at)? <= Utc::now() {
        return Err(ApiError::payment_required("TOKEN_EXPIRED", "Token expired"));
    }
    if remaining_units.parse::<i128>().unwrap_or(0) <= 0 {
        return Err(ApiError::payment_required("NO_CREDIT", "No RPC credit"));
    }
    Ok(SessionInfo {
        session_id: row.get(0),
        license_id: row.get(1),
        user_id: row.get(2),
        wallet_address: row.get(3),
    })
}

async fn upsert_user_wallet(tx: &tokio_postgres::Transaction<'_>, user_id: Option<&str>, license_id: &str, wallet: &str, encrypted_public_key: Option<&str>, status: &str, metadata: &Value, clear_stop: bool) -> ApiResult<()> {
    let metadata_json = metadata.to_string();
    tx.execute(
        r#"
        INSERT INTO user_wallets (user_id, license_id, wallet_address, encrypted_public_key, status, last_seen_at, metadata)
        VALUES ($1::text::uuid, $2::text::uuid, $3, $4, $5, now(), $6::text::jsonb)
        ON CONFLICT (license_id, wallet_address) DO UPDATE
          SET user_id = COALESCE(user_wallets.user_id, EXCLUDED.user_id),
              encrypted_public_key = COALESCE(EXCLUDED.encrypted_public_key, user_wallets.encrypted_public_key),
              status = EXCLUDED.status,
              last_seen_at = now(),
              metadata = CASE
                WHEN $7::boolean THEN (user_wallets.metadata - 'manual_stop_until') || EXCLUDED.metadata
                ELSE user_wallets.metadata || EXCLUDED.metadata
              END
        "#,
        &[&user_id, &license_id, &wallet, &encrypted_public_key, &status, &metadata_json, &clear_stop],
    ).await.map_err(db_error)?;
    Ok(())
}

async fn upsert_runtime_settings(tx: &tokio_postgres::Transaction<'_>, license_id: &str, wallet: &str, runtime: &RuntimeSettings, metadata: &Value) -> ApiResult<()> {
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
            credential_auth_mode: string_value(value, &["credentialAuthMode", "credential_auth_mode", "tx2CredentialMode", "tx2_credential_mode"]).unwrap_or_else(|| "single".to_string()),
            single_trade_auth_amount_usdt: numeric_string(string_value(value, &["singleTradeAuthAmountUsdt", "single_trade_auth_amount_usdt", "authorizedAmountUsdt", "authorized_amount_usdt"]).as_deref(), "0"),
            arbitrage_intensity: string_value(value, &["arbitrageIntensity", "arbitrage_intensity"]).unwrap_or_else(|| "conservative".to_string()),
            rpc_plan_type: string_value(value, &["rpcPlanType", "rpc_plan_type"]).unwrap_or_default(),
            rpc_plan_name: string_value(value, &["rpcPlanName", "rpc_plan_name", "purchasedPlan", "purchased_plan", "packageName", "package_name"]).unwrap_or_default(),
            credit_burn_per_second: string_value(value, &["creditBurnPerSecond", "credit_burn_per_second"]).and_then(|v| v.parse().ok()).unwrap_or(0),
        }
    }
}

fn leaderboard_row(row: Row) -> Value {
    let chain: String = row.get(0);
    let wallet: String = row.get(1);
    let queue_id = normalize_queue_id(row.get::<_, Option<String>>(2));
    let participant_id = normalize_queue_id(row.get::<_, Option<String>>(3));
    let chain_label = if chain == "bnb" { "BNB".to_string() } else { chain.clone() };
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
    if trimmed.len() == 42 && trimmed.starts_with("0x") && trimmed[2..].chars().all(|c| c.is_ascii_hexdigit()) {
        Ok(trimmed.to_lowercase())
    } else {
        Err(ApiError::bad_request("INVALID_WALLET", "Invalid walletAddress"))
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
    let normalized = value.trim().trim_start_matches("0x").trim_start_matches("0X");
    let tail: String = normalized.chars().rev().take(4).collect();
    tail.chars().rev().collect::<String>().to_lowercase()
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

fn non_empty<'a>(value: &'a str, key: &'static str) -> ApiResult<&'a str> {
    if value.trim().is_empty() {
        Err(ApiError::bad_request("BAD_REQUEST", format!("Missing {key}")))
    } else {
        Ok(value.trim())
    }
}

fn first_string(values: &[Option<&str>]) -> Option<String> {
    values.iter().flatten().map(|v| v.trim()).find(|v| !v.is_empty()).map(str::to_string)
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(|v| {
        if let Some(s) = v.as_str() { Some(s.trim().to_string()) }
        else if v.is_number() { Some(v.to_string()) }
        else { None }
    }).filter(|s| !s.is_empty())
}

fn string_value(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| string_field(value, key))
}

fn numeric_string(value: Option<&str>, fallback: &str) -> String {
    value.and_then(|v| v.replace(',', "").parse::<f64>().ok()).map(|v| v.to_string()).unwrap_or_else(|| fallback.to_string())
}

fn usdt_balance(value: &Value, balances: Option<&Value>) -> String {
    string_value(value, &["usdtBalance", "usdt_balance", "usdt", "usdtAmount", "usdt_amount"])
        .or_else(|| balances.and_then(|data| {
            if let Some(usdt) = data.get("usdt").or_else(|| data.get("USDT")) {
                if let Some(formatted) = string_field(usdt, "formatted") {
                    return Some(formatted);
                }
                if let Some(value) = usdt.as_str() {
                    return Some(value.to_string());
                }
                if usdt.is_number() {
                    return Some(usdt.to_string());
                }
            }
            None
        }))
        .unwrap_or_else(|| "0".to_string())
}

fn queue_metadata(value: &Value) -> Value {
    json!({
        "version": string_value(value, &["version", "clientVersion", "client_version"]),
        "market": string_value(value, &["market"]),
        "endpointSlug": string_value(value, &["endpointSlug", "endpoint_slug"]),
        "rpcPlanType": string_value(value, &["rpcPlanType", "rpc_plan_type"]),
        "rpcPlanName": string_value(value, &["rpcPlanName", "rpc_plan_name"]),
        "credentialAuthMode": string_value(value, &["credentialAuthMode", "credential_auth_mode"]),
        "singleTradeAuthAmountUsdt": string_value(value, &["singleTradeAuthAmountUsdt", "single_trade_auth_amount_usdt"]),
        "arbitrageIntensity": string_value(value, &["arbitrageIntensity", "arbitrage_intensity"]),
    })
}

fn bearer_token(headers: &HeaderMap) -> Option<String> {
    headers.get("authorization")?.to_str().ok()?.strip_prefix("Bearer ").map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
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
