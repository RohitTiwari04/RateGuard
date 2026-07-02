-- KEYS[1]: Rate limit key (e.g. rl:user123:ruleabc)
-- ARGV[1]: Limit (max requests allowed)
-- ARGV[2]: Window size in seconds

local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])

local time = redis.call('TIME')
local now = tonumber(time[1])

local current = redis.call('GET', key)
local allowed = 0
local remaining = 0
local reset_time = 0

if not current then
    -- First request in this window
    redis.call('SET', key, 1, 'EX', window)
    allowed = 1
    remaining = limit - 1
    reset_time = now + window
else
    local count = tonumber(current)
    local ttl = redis.call('TTL', key)
    
    if ttl < 0 then
        -- Edge case handling for persistent keys
        redis.call('EXPIRE', key, window)
        ttl = window
    end
    
    reset_time = now + ttl
    
    if count >= limit then
        allowed = 0
        remaining = 0
    else
        redis.call('INCR', key)
        allowed = 1
        remaining = limit - count - 1
    end
end

return {allowed, remaining, reset_time}
