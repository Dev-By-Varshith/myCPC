#pragma once
#include <drogon/drogon.h>
#include <thread>
#include <chrono>

class NightlyCron {
private:
    std::thread cronThread_;
    bool running_;

    void runCronJobs() {
        while (running_) {
            // Get current time
            auto now = std::chrono::system_clock::now();
            time_t tt = std::chrono::system_clock::to_time_t(now);
            tm local_tm = *localtime(&tt);

            // Run nightly at 03:00 AM
            if (local_tm.tm_hour == 3 && local_tm.tm_min == 0) {
                LOG_INFO << "Starting Nightly Analytics Cron Jobs...";
                
                computeFrictionMatrix();
                computeGoldenPath();
                
                LOG_INFO << "Cron Jobs Completed. Pushing to Redis...";
                pushToRedis();

                // Sleep for 24 hours minus a few minutes to prevent double-triggering
                std::this_thread::sleep_for(std::chrono::hours(23));
            } else {
                // Sleep for a minute before checking again
                std::this_thread::sleep_for(std::chrono::minutes(1));
            }
        }
    }

    void computeFrictionMatrix() {
        LOG_INFO << "[CRON] Computing Graveyard / Friction Matrix...";
        // Analyzes Ascension Cohort for problems with high WA/TLE to AC ratios
    }

    void computeGoldenPath() {
        LOG_INFO << "[CRON] Computing Golden Path...";
        // Generates a probabilistic "must-solve" roadmap of high-yield problems
    }

    void pushToRedis() {
        // Mock Redis push
        // In reality, this would use a library like hiredis-vip
        // or drogon::nosql::RedisClient
        LOG_INFO << "[CRON] Successfully pushed matrices to Redis cache.";
    }

public:
    NightlyCron() : running_(false) {}

    void start() {
        running_ = true;
        cronThread_ = std::thread(&NightlyCron::runCronJobs, this);
    }

    void stop() {
        running_ = false;
        if (cronThread_.joinable()) {
            cronThread_.join();
        }
    }

    ~NightlyCron() {
        stop();
    }
};
