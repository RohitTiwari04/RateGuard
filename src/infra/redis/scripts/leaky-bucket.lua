-- KEYS[1]: Rate limit key (e.g. {rl:identifier:ruleId})
-- ARGV[1]: Capacity (bucket capacity / max requests)
-- ARGV[2]: Leak rate (requests leaked per second)
-- ARGV[3]: Water to add per request (typically 1)

local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local leak_rate = tonumber(ARGV[2])
local water_to_add = tonumber(ARGV[3] or "1")

local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000) -- milliseconds

local data = redis.call('HMGET', key, 'water_level', 'last_leak_time')
local water_level = tonumber(data[1])
local last_leak_time = tonumber(data[2])

if not water_level or not last_leak_time then
    -- Bucket is empty and new
    water_level = 0
    last_leak_time = now
else
    -- Leak water based on time elapsed
    local elapsed = now - last_leak_time
    if elapsed > 0 then
        -- leak_rate is per second, convert to per millisecond
        local leaked = elapsed * (leak_rate / 1000)
        water_level = math.max(0, water_level - leaked)
        last_leak_time = now
    end
end

local allowed = 0
if water_level + water_to_add <= capacity then
    water_level = water_level + water_to_add
    allowed = 1
end

-- Save updated values
redis.call('HMSET', key, 'water_level', water_level, 'last_leak_time', last_leak_time)

-- Key TTL: Time to completely leak a full bucket plus buffer
local leak_time_seconds = math.ceil(capacity / leak_rate)
redis.call('EXPIRE', key, leak_time_seconds + 60)

local remaining = math.floor(capacity - water_level)
local reset_time = math.floor(now / 1000) + math.ceil(water_level / leak_rate)

return {allowed, remaining, reset_time}
