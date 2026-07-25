#pragma once
#include <string>
#include <vector>
#include <map>
#include <chrono>
#include <random>
#include <algorithm>
#include <openssl/sha.h>
#include <iomanip>
#include <sstream>
#include <drogon/drogon.h>
#include "RateLimiter.h"

class CFApiClient {
private:
    std::string apiKey_;
    std::string apiSecret_;

    std::string generateRandomString(int length) {
        const std::string chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        std::mt19937 generator(std::chrono::system_clock::now().time_since_epoch().count());
        std::uniform_int_distribution<int> distribution(0, chars.size() - 1);
        
        std::string randStr;
        for (int i = 0; i < length; ++i) {
            randStr += chars[distribution(generator)];
        }
        return randStr;
    }

    std::string sha512(const std::string& input) {
        unsigned char hash[SHA512_DIGEST_LENGTH];
        SHA512_CTX sha512;
        SHA512_Init(&sha512);
        SHA512_Update(&sha512, input.c_str(), input.length());
        SHA512_Final(hash, &sha512);

        std::stringstream ss;
        for(int i = 0; i < SHA512_DIGEST_LENGTH; i++) {
            ss << std::hex << std::setw(2) << std::setfill('0') << (int)hash[i];
        }
        return ss.str();
    }

public:
    CFApiClient(const std::string& key, const std::string& secret) 
        : apiKey_(key), apiSecret_(secret) {}

    // Generates the authenticated URL for a given CF API method
    std::string buildAuthenticatedUrl(const std::string& methodName, std::map<std::string, std::string> params) {
        // Add auth parameters
        params["apiKey"] = apiKey_;
        params["time"] = std::to_string(std::chrono::system_clock::now().time_since_epoch() / std::chrono::seconds(1));

        // Sort parameters by key
        std::vector<std::pair<std::string, std::string>> sortedParams(params.begin(), params.end());
        
        std::string queryString;
        for (size_t i = 0; i < sortedParams.size(); ++i) {
            if (i > 0) queryString += "&";
            queryString += sortedParams[i].first + "=" + sortedParams[i].second;
        }

        std::string randPrefix = generateRandomString(6);
        std::string textToHash = randPrefix + "/" + methodName + "?" + queryString + "#" + apiSecret_;
        std::string hashStr = sha512(textToHash);

        return "https://codeforces.com/api/" + methodName + "?" + queryString + "&apiSig=" + randPrefix + hashStr;
    }

    // Example of executing a public request (for Ascension Cohort scraping)
    void executePublicRequest(const std::string& url, std::function<void(const drogon::HttpResponsePtr&)> callback) {
        cfRateLimiter.waitAndConsume(1.0); // Wait for our 5 req/sec budget
        auto client = drogon::HttpClient::newHttpClient("https://codeforces.com");
        auto req = drogon::HttpRequest::newHttpRequest();
        req->setPath(url.substr(24)); // Remove https://codeforces.com
        req->setMethod(drogon::Get);
        
        client->sendRequest(req, [callback](drogon::ReqResult res, const drogon::HttpResponsePtr& resp) {
            if (res == drogon::ReqResult::Ok) {
                callback(resp);
            } else {
                LOG_ERROR << "CF API Request failed";
                // Handle error
            }
        });
    }
};
