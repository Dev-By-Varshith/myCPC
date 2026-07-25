#pragma once
#include <drogon/HttpController.h>
#include "CodeScraper.h"

using namespace drogon;

class CodeExplorerController : public drogon::HttpController<CodeExplorerController> {
public:
    METHOD_LIST_BEGIN
    ADD_METHOD_TO(CodeExplorerController::getGmSolutions, "/api/code/gm_solutions", Get);
    ADD_METHOD_TO(CodeExplorerController::fetchCode, "/api/code/fetch", Get);
    METHOD_LIST_END

    void getGmSolutions(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback);
    void fetchCode(const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)>&& callback);
};
