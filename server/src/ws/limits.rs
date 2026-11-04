//! Bid rate limit shared by every instance: 5 bids per 10 s per user (cahier
//! §6). A Lua script makes "prune, count, record" one atomic step over a sorted
//! set of attempt timestamps, so two tabs on two instances share one budget.

use redis::aio::ConnectionManager;
use uuid::Uuid;

const BID_WINDOW_MS: i64 = 10_000;
const BID_MAX: i64 = 5;

/// KEYS[1] = attempts of one user; ARGV = now (ms), window (ms), max, a unique
/// member for this attempt. Returns 1 when recorded, 0 when over the limit.
const BID_SCRIPT: &str = "
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, now - window)
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then
  return 0
end
redis.call('ZADD', KEYS[1], now, ARGV[4])
redis.call('PEXPIRE', KEYS[1], window)
return 1
";

/// Records one bid attempt and tells whether it is within the limit.
pub async fn bid_allowed(broker: &mut ConnectionManager, user: Uuid) -> redis::RedisResult<bool> {
    let allowed: i64 = redis::Script::new(BID_SCRIPT)
        .key(format!("bids:{user}"))
        .arg(chrono::Utc::now().timestamp_millis())
        .arg(BID_WINDOW_MS)
        .arg(BID_MAX)
        .arg(Uuid::new_v4().to_string())
        .invoke_async(broker)
        .await?;
    Ok(allowed == 1)
}
