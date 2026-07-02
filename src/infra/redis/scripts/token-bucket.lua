-- KEYS[1]: Rate limit key (e.g. {rl:identifier:ruleId})
-- ARGV[1]: Capacity (max tokens)
-- ARGV[2]: Refill rate (tokens per second)
-- ARGV[3]: Requested tokens (typically 1)

local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local requested = tonumber(ARGV[3] or "1")

local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000) -- milliseconds

local data = redis.call('HMGET', key, 'tokens', 'last_updated')
local tokens = tonumber(data[1])
local last_updated = tonumber(data[2])

if not tokens or not last_updated then
    -- Bucket is new
    tokens = capacity
    last_updated = now
else
    -- Replenish tokens based on time elapsed
    local elapsed = now - last_updated
    if elapsed > 0 then
        -- refill_rate is per second, convert to per millisecond
        local generated = elapsed * (refill_rate / 1000)
        tokens = math.min(capacity, tokens + generated)
        last_updated = now
    end
end

local allowed = 0
if tokens >= requested then
    tokens = tokens - requested
    allowed = 1
end

-- Save updated values
redis.call('HMSET', key, 'tokens', tokens, 'last_updated', last_updated)

-- Key TTL: Time to completely refill the bucket plus buffer
local fill_time_seconds = math.ceil(capacity / refill_rate)
redis.call('EXPIRE', key, fill_time_seconds + 60)

local remaining = math.floor(tokens)
local reset_time = math.floor(now / 1000) + math.ceil((capacity - tokens) / refill_rate)

return {allowed, remaining, reset_time}
