#include "TelemetryController.h"

void TelemetryController::recordCompileLatency(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback) {
    auto jsonBody = req->getJsonObject();
    Json::Value ret;

    if (!jsonBody) {
        ret["status"] = "error";
        ret["message"] = "Invalid JSON body";
        auto resp = HttpResponse::newHttpJsonResponse(ret);
        resp->setStatusCode(k400BadRequest);
        callback(resp);
        return;
    }

    std::string templateName = (*jsonBody)["template_name"].asString();
    int compileTimeMs = (*jsonBody)["compile_time_ms"].asInt();
    long long timestamp = (*jsonBody)["timestamp"].asInt64();

    LOG_INFO << "Received Telemetry Ping: Template [" << templateName 
             << "] compiled in " << compileTimeMs << "ms at timestamp " << timestamp;

    // Here we would push this metric to Redis:
    // e.g., LPUSH session:{id}:telemetry_latency '{ "template": "SegmentTree", "ms": 450 }'

    ret["status"] = "success";
    ret["message"] = "Telemetry ping recorded";
    ret["recorded_latency_ms"] = compileTimeMs;

    auto resp = HttpResponse::newHttpJsonResponse(ret);
    resp->addHeader("Access-Control-Allow-Origin", "*");
    callback(resp);
}
