#pragma once
#include <string>
#include <vector>
#include <unordered_map>
#include <json/json.h>
#include <drogon/drogon.h>

struct FrictionProblem {
    std::string problemId;
    std::string name;
    int rating;
    double avgWaBeforeAc;
    std::string mostCommonError;
    int totalCohortAc;
};

class FrictionAnalyzer {
public:
    // Identifies "Trap" problems where the cohort failed multiple times before succeeding
    Json::Value computeGraveyard(int targetRating) {
        LOG_INFO << "Computing Friction Matrix (Graveyard) for cohort rating: " << targetRating;
        
        // Algorithm Outline:
        // 1. Using the identified Ascension Cohort from CohortAnalyzer.
        // 2. Iterate through all submissions in user.status.
        // 3. For every problem that eventually gets "OK" (Accepted), count the preceding "WRONG_ANSWER" or "TIME_LIMIT_EXCEEDED" verdicts.
        // 4. Aggregate these stats across the entire cohort.
        // 5. Filter for problems where (avgWaBeforeAc >= 2.5) -> These are "Traps".

        std::unordered_map<std::string, FrictionProblem> graveyardMap;

        // Mock computation data
        graveyardMap["1950D"] = {"1950D", "Edge Cases Galore", 1500, 4.2, "Wrong Answer on Test 4", 45};
        graveyardMap["1920B"] = {"1920B", "Deceptive Greedy", 1600, 3.8, "Time Limit Exceeded", 50};
        graveyardMap["1915F"] = {"1915F", "Hidden Bounds", 1600, 3.5, "Wrong Answer on Test 12", 42};

        Json::Value result(Json::arrayValue);
        for (const auto& pair : graveyardMap) {
            Json::Value p;
            p["problem_id"] = pair.second.problemId;
            p["name"] = pair.second.name;
            p["rating"] = pair.second.rating;
            p["avg_wa_before_ac"] = pair.second.avgWaBeforeAc;
            p["common_error"] = pair.second.mostCommonError;
            result.append(p);
        }

        // Push 'result' to Redis in reality:
        // RedisClient->execCommandAsync("SET graveyard:%d %s", targetRating, result.toStyledString());

        return result;
    }
};
