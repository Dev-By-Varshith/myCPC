#include "GhostArenaController.h"

void GhostArenaController::getTimeline(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback) {
    Json::Value ret;
    ret["status"] = "success";
    
    Json::Value timeline(Json::arrayValue);
    
    // Mock Data for "Ghost Arena" timeline
    Json::Value sub1;
    sub1["handle"] = "tourist";
    sub1["rank"] = "Grandmaster";
    sub1["problem"] = "A";
    sub1["time_seconds"] = 120;
    sub1["verdict"] = "Accepted";
    timeline.append(sub1);

    Json::Value sub2;
    sub2["handle"] = "baseline_1600";
    sub2["rank"] = "Expert";
    sub2["problem"] = "A";
    sub2["time_seconds"] = 340;
    sub2["verdict"] = "Wrong Answer";
    timeline.append(sub2);
    
    Json::Value sub3;
    sub3["handle"] = "baseline_1600";
    sub3["rank"] = "Expert";
    sub3["problem"] = "A";
    sub3["time_seconds"] = 450;
    sub3["verdict"] = "Accepted";
    timeline.append(sub3);

    ret["timeline"] = timeline;

    auto resp = HttpResponse::newHttpJsonResponse(ret);
    // Add CORS headers for local Vite dev server
    resp->addHeader("Access-Control-Allow-Origin", "*");
    callback(resp);
}
