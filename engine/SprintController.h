#pragma once
#include <drogon/HttpController.h>

using namespace drogon;

class SprintController : public drogon::HttpController<SprintController> {
public:
    METHOD_LIST_BEGIN
    ADD_METHOD_TO(SprintController::getSprintData, "/api/sprint/current", Get);
    METHOD_LIST_END

    void getSprintData(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback) {
        Json::Value ret;
        ret["status"] = "success";
        
        Json::Value sprint;
        sprint["day_current"] = 12;
        sprint["day_total"] = 50;
        sprint["target_rating"] = 1600;
        sprint["daily_quota"] = 3; // Problems required today
        sprint["daily_completed"] = 1;
        sprint["burnout_metric"] = "Optimal"; // Volume vs Quality ratio
        sprint["latency_tracker_c++"] = "98% (Template memory deployment is fast)";
        
        ret["data"] = sprint;

        auto resp = HttpResponse::newHttpJsonResponse(ret);
        resp->addHeader("Access-Control-Allow-Origin", "*");
        callback(resp);
    }
};
