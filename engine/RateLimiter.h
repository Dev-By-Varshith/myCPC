#pragma once
#include <mutex>
#include <chrono>
#include <thread>
#include <drogon/drogon.h>

class TokenBucket {
private:
    double capacity_;
    double tokens_;
    double fillRatePerSecond_;
    std::chrono::steady_clock::time_point lastRefill_;
    std::mutex mtx_;

public:
    TokenBucket(double capacity, double fillRatePerSecond)
        : capacity_(capacity), tokens_(capacity), fillRatePerSecond_(fillRatePerSecond),
          lastRefill_(std::chrono::steady_clock::now()) {}

    bool consume(double tokensToConsume = 1.0) {
        std::lock_guard<std::mutex> lock(mtx_);
        refill();
        if (tokens_ >= tokensToConsume) {
            tokens_ -= tokensToConsume;
            return true;
        }
        return false;
    }

    void waitAndConsume(double tokensToConsume = 1.0) {
        while (true) {
            {
                std::lock_guard<std::mutex> lock(mtx_);
                refill();
                if (tokens_ >= tokensToConsume) {
                    tokens_ -= tokensToConsume;
                    return;
                }
            }
            // Sleep briefly to avoid busy-waiting, let the bucket refill
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }
    }

private:
    void refill() {
        auto now = std::chrono::steady_clock::now();
        std::chrono::duration<double> elapsedTime = now - lastRefill_;
        double newTokens = elapsedTime.count() * fillRatePerSecond_;
        
        if (newTokens > 0) {
            tokens_ = std::min(capacity_, tokens_ + newTokens);
            lastRefill_ = now;
        }
    }
};

// Global rate limiter instance for Codeforces API (5 requests per second)
// Using slightly less than 5 to be safe from bans (e.g. 4.5)
inline TokenBucket cfRateLimiter(5.0, 4.5);
