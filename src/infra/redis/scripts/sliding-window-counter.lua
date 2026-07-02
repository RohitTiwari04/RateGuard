-- KEYS[1]: Current window key, e.g., {rl:identifier:ruleId}:current
-- KEYS[2]: Previous window key, e.g., {rl:identifier:ruleId}:previous
-- ARGV[1]: Limit (max requests allowed)
-- ARGV[2]: Window size in seconds

local current_key = KEYS[1]
local previous_key = KEYS[2]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])

local time = redis.call('TIME')
local now = tonumber(time[1])

local current_count = tonumber(redis.call('GET', current_key) or "0")
local previous_count = tonumber(redis.call('GET', previous_key) or "0")

local elapsed = now % window
local weight = (window - elapsed) / window
local estimated_count = current_count + (previous_count * weight)

local allowed = 0
local remaining = 0
local reset_time = now + (window - elapsed)

if estimated_count < limit then
    -- Increment current window
    redis.call('INCR', current_key)
    
    -- Ensure key expires after 2 * window to clean up
    local ttl = redis.call('TTL', current_key)
    if ttl < 0 then
        redis.call('EXPIRE', current_key, window * 2)
    end
    
    allowed = 1
    remaining = math.max(0, math.floor(limit - estimated_count - 1))
else
    allowed = 0
    remaining = 0
end

return {allowed, remaining, reset_time}
