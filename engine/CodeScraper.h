#pragma once
#include <drogon/drogon.h>
#include <string>
#include <regex>

class CodeScraper {
public:
    // Fetches and parses the raw C++ code from a CF submission page
    static void fetchSubmissionCode(const std::string& contestId, const std::string& submissionId, std::function<void(const std::string&, bool)> callback) {
        LOG_INFO << "Scraping submission: " << submissionId << " from contest: " << contestId;
        
        auto client = drogon::HttpClient::newHttpClient("https://codeforces.com");
        auto req = drogon::HttpRequest::newHttpRequest();
        std::string path = "/contest/" + contestId + "/submission/" + submissionId;
        req->setPath(path);
        req->setMethod(drogon::Get);

        // Add headers to mimic a real browser to bypass simple blocks
        req->addHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36");
        req->addHeader("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8");

        client->sendRequest(req, [callback](drogon::ReqResult res, const drogon::HttpResponsePtr& resp) {
            if (res != drogon::ReqResult::Ok || !resp) {
                LOG_ERROR << "HTTP request failed for Codeforces scraper.";
                callback("", false);
                return;
            }

            if (resp->getStatusCode() != drogon::k200OK) {
                LOG_ERROR << "Codeforces returned status: " << resp->getStatusCode();
                callback("", false);
                return;
            }

            std::string html = std::string(resp->getBody());
            
            // Regex to extract code from <pre id="program-source-text">...
            // Note: C++ regex can be slow/fragile for HTML, but for this specific block it works.
            std::regex codeRegex("<pre id=\"program-source-text\"[^>]*>([\\s\\S]*?)</pre>");
            std::smatch match;
            
            if (std::regex_search(html, match, codeRegex) && match.size() > 1) {
                std::string rawCode = match.str(1);
                
                // Unescape basic HTML entities
                rawCode = std::regex_replace(rawCode, std::regex("&lt;"), "<");
                rawCode = std::regex_replace(rawCode, std::regex("&gt;"), ">");
                rawCode = std::regex_replace(rawCode, std::regex("&amp;"), "&");
                rawCode = std::regex_replace(rawCode, std::regex("&quot;"), "\"");
                
                callback(rawCode, true);
            } else {
                LOG_ERROR << "Could not find program-source-text in HTML. Possible Cloudflare block or UI update.";
                callback("", false);
            }
        });
    }
};
