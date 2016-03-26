// Prova nodejs on Azure
// Author: spino9330
// Project: FourEvent.BackEnd

var fs = require("fs")
var http = require('http')

var port = process.env.PORT || 1337

http.createServer(function(request, response) {
  if(request.url === "/"){
     fs.readFile("index.html", function (err, data) {
       if (err) {
          response.writeHead(404);
          response.write("Not found");
       }
       else
       {
         response.writeHead(200, {'Content-Type': 'text/html'});
         response.write(data);
       }
     });
    }
    else {
      res.writeHead(404, {'Content-Type': 'text/html'});
      res.write('not found : ' + req.url);
      res.end();
    }

}).listen(port);
