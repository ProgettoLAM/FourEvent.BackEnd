// Prova nodejs on Azure
// Author: spino9330
// Project: FourEvent.BackEnd

var fs = require("fs")
var http = require('http')

var port = process.env.PORT || 1337

http.createServer(function(req, res) {

    if(req.url === "/index"){
       fs.readFile("index.html", function (err, data) {
          res.writeHead(200, {'Content-Type': 'text/html'});
          res.write(data);
          res.end();
       });
    }
    else {
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.write('<b>Hey there!</b><br /><br />This is the default response. Requested URL is: ' + req.url);
      res.end();
    }

}).listen(port);
