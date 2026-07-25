#pragma once
#include <drogon/drogon.h>
#include <thread>
#include "CFApiClient.h"

class BackgroundWorker {
private:
    std::shared_ptr<CFApiClient> apiClient_;
    std::thread workerThread_;
    bool running_;

    void scrapeLoop() {
        while (running_) {
            LOG_INFO << "Background Worker: Scraping 1600/1900 baseline cohort data...";
            
            // Example endpoint for public scraping
            std::string url = "https://codeforces.com/api/user.status?handle=tourist&from=1&count=10";
            
            apiClient_->executePublicRequest(url, [](const drogon::HttpResponsePtr& resp) {
                if (resp && resp->getStatusCode() == drogon::k200OK) {
                    LOG_INFO << "Scrape success. Processing payload...";
                    // In a real app, process and store into PostgreSQL and Redis here
                }
            });

            // Sleep to simulate daily/hourly cron schedule
            std::this_thread::sleep_for(std::chrono::hours(1));
        }
    }

public:
    BackgroundWorker(std::shared_ptr<CFApiClient> client) : apiClient_(client), running_(false) {}

    void start() {
        running_ = true;
        workerThread_ = std::thread(&BackgroundWorker::scrapeLoop, this);
    }

    void stop() {
        running_ = false;
        if (workerThread_.joinable()) {
            workerThread_.join();
        }
    }

    ~BackgroundWorker() {
        stop();
    }
};
