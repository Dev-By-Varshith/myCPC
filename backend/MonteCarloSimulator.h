#pragma once
#include <vector>
#include <random>
#include <numeric>
#include <cmath>
#include <json/json.h>
#include <drogon/drogon.h>

class MonteCarloSimulator {
private:
    std::pair<double, double> calculateMeanAndStdDev(const std::vector<double>& times) {
        if (times.empty()) return {0.0, 0.0};
        
        double sum = std::accumulate(times.begin(), times.end(), 0.0);
        double mean = sum / times.size();
        
        double sq_sum = std::inner_product(times.begin(), times.end(), times.begin(), 0.0);
        double stdev = std::sqrt(sq_sum / times.size() - mean * mean);
        
        return {mean, stdev};
    }

public:
    // Calculates the probability that the user beats the target Ghost in a virtual contest.
    // userTimes: The user's last 20 solve times for a specific rating bracket.
    // ghostTimes: The target Ghost's solve times for the same bracket.
    Json::Value calculateWinProbability(const std::vector<double>& userTimes, const std::vector<double>& ghostTimes) {
        LOG_INFO << "Running Monte Carlo Simulation (10,000 iterations)...";

        auto userStats = calculateMeanAndStdDev(userTimes);
        auto ghostStats = calculateMeanAndStdDev(ghostTimes);

        // Lower time is better
        double userMean = userStats.first;
        double userStdDev = userStats.second;
        double ghostMean = ghostStats.first;
        double ghostStdDev = ghostStats.second;

        std::random_device rd;
        std::mt19937 gen(rd());
        std::normal_distribution<> userDist(userMean, userStdDev);
        std::normal_distribution<> ghostDist(ghostMean, ghostStdDev);

        const int iterations = 10000;
        int userWins = 0;

        for (int i = 0; i < iterations; ++i) {
            double simulatedUserTime = userDist(gen);
            double simulatedGhostTime = ghostDist(gen);

            // Cannot have negative times
            if (simulatedUserTime < 0) simulatedUserTime = 0;
            if (simulatedGhostTime < 0) simulatedGhostTime = 0;

            if (simulatedUserTime < simulatedGhostTime) {
                userWins++;
            }
        }

        double winProbability = (static_cast<double>(userWins) / iterations) * 100.0;

        Json::Value result;
        result["win_probability"] = winProbability;
        result["user_mean_time"] = userMean;
        result["ghost_mean_time"] = ghostMean;

        return result;
    }
};
