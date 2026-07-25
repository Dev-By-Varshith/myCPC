#pragma once
#include <string>
#include <vector>
#include <unordered_map>
#include <algorithm>
#include <json/json.h>
#include <drogon/drogon.h>
#include "CFApiClient.h"

// Represents a problem mapped to cohort stats
struct CohortProblem {
    std::string problemId;
    std::string name;
    int rating;
    int solveCount;
    double overlapPercentage;
};

class CohortAnalyzer {
private:
    std::shared_ptr<CFApiClient> apiClient_;

public:
    CohortAnalyzer(std::shared_ptr<CFApiClient> client) : apiClient_(client) {}

    // Mock representation of the heavy cohort analysis
    // In production, this runs as a nightly cron, scanning CF API and saving to Redis.
    Json::Value computeAscensionCohort(int targetRatingStart, int targetRatingEnd) {
        LOG_INFO << "Computing Ascension Cohort for range: " << targetRatingStart << " -> " << targetRatingEnd;
        
        // Algorithm Outline:
        // 1. Fetch user.ratedList (active users).
        // 2. Filter users whose rating 6 months ago was <= targetRatingStart and is now >= targetRatingEnd.
        // 3. For each user, fetch user.status (submissions).
        // 4. Track all AC'd problems in an unordered_map<problemId, count>.
        
        // Example computation result:
        std::unordered_map<std::string, CohortProblem> problemMap;
        int totalCohortSize = 65; // Let's say we found 65 users who ranked up

        // Mocking the intersection math
        problemMap["1982A"] = {"1982A", "Scuza", 1600, 58, (58.0 / 65.0) * 100};
        problemMap["1980C"] = {"1980C", "Copil Copac", 1600, 52, (52.0 / 65.0) * 100};
        problemMap["1975D"] = {"1975D", "Human Equation", 1700, 48, (48.0 / 65.0) * 100};

        std::vector<CohortProblem> sortedProblems;
        for (const auto& pair : problemMap) {
            sortedProblems.push_back(pair.second);
        }

        // Sort by frequency (The Golden Path)
        std::sort(sortedProblems.begin(), sortedProblems.end(), [](const CohortProblem& a, const CohortProblem& b) {
            return a.solveCount > b.solveCount;
        });

        Json::Value result(Json::arrayValue);
        for (const auto& prob : sortedProblems) {
            Json::Value p;
            p["problem_id"] = prob.problemId;
            p["name"] = prob.name;
            p["rating"] = prob.rating;
            p["overlap_percentage"] = prob.overlapPercentage;
            result.append(p);
        }

        // Push 'result' to Redis in reality:
        // RedisClient->execCommandAsync("SET golden_path:2100 %s", result.toStyledString());

        return result;
    }
};
