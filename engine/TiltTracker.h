#pragma once
#include <vector>
#include <string>
#include <chrono>
#include <json/json.h>

struct Submission {
    std::string verdict;
    int timeSeconds; // Unix timestamp
};

class TiltTracker {
public:
    // Analyzes a sequence of submissions for a single problem
    // Returns a JSON object with metrics like average tilt delta and "guessing" classification.
    static Json::Value analyzeProblemSubmissions(const std::vector<Submission>& subs) {
        Json::Value result;
        int tiltCount = 0;
        int totalDelta = 0;

        for (size_t i = 1; i < subs.size(); ++i) {
            // If previous was a fail and this is another submission
            if (subs[i-1].verdict != "OK" && subs[i-1].verdict != "Accepted") {
                int delta = subs[i].timeSeconds - subs[i-1].timeSeconds;
                
                // If delta is less than 120 seconds, it's highly likely rapid-fire guessing (Tilt)
                if (delta < 120) {
                    tiltCount++;
                }
                totalDelta += delta;
            }
        }

        result["tilt_count"] = tiltCount;
        result["is_tilting"] = tiltCount > 2;
        
        if (subs.size() > 1) {
            result["avg_recovery_time"] = totalDelta / (subs.size() - 1);
        } else {
            result["avg_recovery_time"] = 0;
        }

        return result;
    }
};
