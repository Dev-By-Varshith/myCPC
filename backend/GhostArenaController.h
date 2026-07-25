#pragma once
#include <drogon/HttpController.h>

using namespace drogon;

class GhostArenaController : public drogon::HttpController<GhostArenaController> {
public:
    METHOD_LIST_BEGIN
    // Use METHOD_ADD to define routes
    ADD_METHOD_TO(GhostArenaController::getTimeline, "/api/ghost-arena/timeline", Get);
    METHOD_LIST_END

    // Route Handler
    void getTimeline(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback);
};
