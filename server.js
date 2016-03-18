/**
 * Created by Gianmarco on 17/03/2016.
 */

var http = require('http')
var port = process.env.PORT || 1337;
http.createServer(function(req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end("Hello World\nI'm in release");
}).listen(port);