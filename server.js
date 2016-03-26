// Prova nodejs on Azure
// Author: spino9330
// Project: FourEvent.BackEnd

var http = require('http')
var port = process.env.PORT || 1337;
http.createServer(function(req, res) {

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end("Hello Matey!");

}).listen(port);
