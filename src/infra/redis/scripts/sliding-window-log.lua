-- KEYS[1]: Rate limit key (e.g. {rl:identifier:ruleId})
-- ARGV[1]: Limit (max requests allowed)
-- ARGV[2]: Window size in seconds
-- ARGV[3]: Unique request UUID or identifier to prevent ZSET deduplication

local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local request_id = ARGV[3]

local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local clear_before = now - (window * 1000)

-- Clean up older entries outside of the sliding window
redis.call('ZREMRANGEBYSCORE', key, '-inf', clear_before)

-- Count logs in current sliding window
local current_requests = redis.call('ZCARD', key)

local allowed = 0
local remaining = 0
local reset_time = 0

-- Check if we are within the limit
if current_requests < limit then
    allowed = 1
    redis.call('ZADD', key, now, request_id)
    redis.call('EXPIRE', key, window)
    remaining = limit - current_requests - 1
    reset_time = math.floor((now + (window * 1000)) / 1000)
else
    allowed = 0
    remaining = 0
    -- Reset time is when the oldest element in the window will slide out
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    if oldest and oldest[2] then
        reset_time = math.floor((tonumber(oldest[2]) + (window * 1000)) / 1000)
    else
        reset_time = math.floor(now / 1000) + window
    end
end

return {allowed, remaining, reset_time}
