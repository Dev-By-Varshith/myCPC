#include <drogon/drogon.h>

using namespace drogon;

int main() {
    LOG_INFO << "Starting Codeforces Dashboard Backend...";

    // Simple test route
    app().registerHandler(
        "/ping",
        [](const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback) {
            auto resp = HttpResponse::newHttpResponse();
            resp->setStatusCode(k200OK);
            resp->setContentTypeCode(CT_TEXT_PLAIN);
            resp->setBody("pong");
            callback(resp);
        },
        {Get});

    // Load config.json which initializes DB and Redis connection pools automatically
    app().loadConfigFile("config.json").run();
    return 0;
}
