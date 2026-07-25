#pragma once
#include <drogon/HttpController.h>

using namespace drogon;

class TelemetryController : public drogon::HttpController<TelemetryController> {
public:
    METHOD_LIST_BEGIN
    // Endpoint for local file watcher to ping when a template is successfully compiled
    ADD_METHOD_TO(TelemetryController::recordCompileLatency, "/api/telemetry/compile_ping", Post);
    METHOD_LIST_END

    void recordCompileLatency(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback);
};
