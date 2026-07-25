const http = require('http');
const https = require('https');
const url = require('url');

const server = http.createServer((req, res) => {
    // Enable CORS so the React frontend can call this
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Request-Method', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', '*');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const targetUrl = parsedUrl.query.url;

    if (!targetUrl) {
        res.writeHead(400);
        res.end("Missing url parameter");
        return;
    }

    console.log("Scraping:", targetUrl);

    // Fetch the URL pretending to be a real browser
    https.get(targetUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5'
        }
    }, (proxyRes) => {
        let data = '';
        proxyRes.on('data', chunk => data += chunk);
        proxyRes.on('end', () => {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(data);
        });
    }).on('error', (err) => {
        console.error(err);
        res.writeHead(500);
        res.end(err.message);
    });
});

server.listen(3001, () => {
    console.log("Local scraper proxy running on port 3001");
});
