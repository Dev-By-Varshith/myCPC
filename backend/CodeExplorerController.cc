#include "CodeExplorerController.h"

void CodeExplorerController::getGmSolutions(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback) {
    std::string problemId = req->getParameter("problem");
    
    // In production, this would query Redis/DB for the latest active GMs and their submissions for this problem.
    // For this prototype, we return mock metadata pointing to real CF submissions we can scrape.
    
    Json::Value ret;
    ret["status"] = "success";
    ret["problem_id"] = problemId;

    Json::Value solutions(Json::arrayValue);
    
    // Mock GM submissions. Let's say problem 1920B (Contest 1920)
    Json::Value sub1;
    sub1["handle"] = "tourist";
    sub1["submission_id"] = "242000000"; // Example ID
    sub1["contest_id"] = "1920";
    sub1["language"] = "C++17 (GCC 7-32)";
    sub1["time_ms"] = 15;
    sub1["memory_kb"] = 256;
    solutions.append(sub1);

    Json::Value sub2;
    sub2["handle"] = "Benq";
    sub2["submission_id"] = "242000001";
    sub2["contest_id"] = "1920";
    sub2["language"] = "C++20 (GCC 13-64)";
    sub2["time_ms"] = 31;
    sub2["memory_kb"] = 1024;
    solutions.append(sub2);

    ret["solutions"] = solutions;

    auto resp = HttpResponse::newHttpJsonResponse(ret);
    resp->addHeader("Access-Control-Allow-Origin", "*");
    callback(resp);
}

void CodeExplorerController::fetchCode(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback) {
    std::string contestId = req->getParameter("contest_id");
    std::string submissionId = req->getParameter("submission_id");

    if (contestId.empty() || submissionId.empty()) {
        Json::Value ret;
        ret["status"] = "error";
        ret["message"] = "Missing contest_id or submission_id";
        auto resp = HttpResponse::newHttpJsonResponse(ret);
        callback(resp);
        return;
    }

    // Call our scraper
    CodeScraper::fetchSubmissionCode(contestId, submissionId, [callback](const std::string& code, bool success) {
        Json::Value ret;
        if (success) {
            ret["status"] = "success";
            ret["code"] = code;
        } else {
            ret["status"] = "error";
            ret["message"] = "Failed to scrape code. Cloudflare block or invalid ID.";
            
            // Provide a mock C++ template string so the frontend modal can still be demonstrated
            // even if the scraper fails or CF is blocking us locally.
            ret["code"] = "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios_base::sync_with_stdio(0); cin.tie(0);\n    // Scraper failed. This is mock template code.\n    int t; cin >> t;\n    while(t--) {\n        // solve\n    }\n    return 0;\n}";
        }

        auto resp = HttpResponse::newHttpJsonResponse(ret);
        resp->addHeader("Access-Control-Allow-Origin", "*");
        callback(resp);
    });
}
